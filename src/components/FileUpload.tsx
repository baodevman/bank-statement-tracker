import React, { useState, useRef, useEffect } from 'react';
import { Upload, Lock, Unlock, Loader2, AlertCircle, DollarSign } from 'lucide-react';
import { detectTemplateAndMapping, parseTransactionsFromRaw, parseAmount } from '../utils/pdfParser';
import type { RawRow, ColumnMapping } from '../utils/pdfParser';
import type { Transaction, BankMappingTemplate } from '../utils/db';
import { getBankPasswords, saveBankPasswords, savePdfStatement, getAppSettings } from '../utils/db';
import { saveGlobalBank, type AppUser } from '../utils/bankTemplateService';
import { ColumnMapper } from './ColumnMapper';

interface FileUploadProps {
  onTransactionsParsed: (transactions: Transaction[], statementName: string) => void;
  onError: (msg: string) => void;
  externalPDFs?: { data: ArrayBuffer; name: string }[] | null;
  onClearExternal?: () => void;
  currentUserDoc: AppUser | null;
  incrementUploadCounter: (filesCount: number) => Promise<boolean>;
  globalTemplates: BankMappingTemplate[];
  onSaveGlobalTemplate: (template: BankMappingTemplate) => Promise<void>;
  selectedTemplateId: string;
  setSelectedTemplateId: (id: string) => void;
  globalBanks?: string[];
}

export const FileUpload: React.FC<FileUploadProps> = ({
  onTransactionsParsed,
  onError,
  externalPDFs = null,
  onClearExternal,
  currentUserDoc,
  incrementUploadCounter,
  globalTemplates,
  onSaveGlobalTemplate,
  selectedTemplateId,
  setSelectedTemplateId,
  globalBanks = []
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [fileData, setFileData] = useState<ArrayBuffer | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // File Queue and Accumulation States for Multi-Selection
  const [fileQueue, setFileQueue] = useState<{ data: ArrayBuffer; name: string }[]>([]);
  const [accumulatedTransactions, setAccumulatedTransactions] = useState<Transaction[]>([]);
  const [currentFileIndex, setCurrentFileIndex] = useState<number>(0);
  const [totalFiles, setTotalFiles] = useState<number>(0);

  // Password State
  const [password, setPassword] = useState<string>('');
  const [showPasswordModal, setShowPasswordModal] = useState<boolean>(false);
  const [passwordError, setPasswordError] = useState<string>('');
  const [savePasswordCheckbox, setSavePasswordCheckbox] = useState<boolean>(true);

  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [isMappingMode, setIsMappingMode] = useState<boolean>(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check upload limits
  const checkUploadLimit = (filesCount: number): boolean => {
    if (!currentUserDoc) return true;
    if (currentUserDoc.isPremium) return true;

    const todayStr = new Date().toISOString().split('T')[0];
    let uploadsToday = currentUserDoc.uploadsToday;
    if (currentUserDoc.lastUploadDate !== todayStr) {
      uploadsToday = 0;
    }

    if (uploadsToday + filesCount > currentUserDoc.dailyUploadLimit) {
      setShowUpgradeModal(true);
      return false;
    }
    return true;
  };

  // Detect and process external PDFs from Google Drive
  useEffect(() => {
    if (externalPDFs && externalPDFs.length > 0) {
      if (checkUploadLimit(externalPDFs.length)) {
        startQueue(externalPDFs);
      } else {
        if (onClearExternal) onClearExternal();
      }
    }
  }, [externalPDFs]);

  // Enqueue a list of files and begin sequential parsing
  const startQueue = (pdfs: { data: ArrayBuffer; name: string }[]) => {
    setFileQueue(pdfs);
    setAccumulatedTransactions([]);
    setCurrentFileIndex(0);
    setTotalFiles(pdfs.length);

    // Reset UI states
    setRawRows([]);
    setPassword('');
    setPasswordError('');
    setShowPasswordModal(false);
    setIsMappingMode(false);

    // Load first file
    const first = pdfs[0];
    setFile(new File([first.data], first.name, { type: 'application/pdf' }));
    setFileData(first.data);
    tryDecryptPDF(first.data, first.name, '');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(Array.from(e.target.files));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  };

  // Process list of local files
  const processFiles = async (selectedFiles: File[]) => {
    const pdfFiles = selectedFiles.filter(
      f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );

    if (pdfFiles.length === 0) {
      onError('Vui lòng chỉ tải lên tệp PDF.');
      return;
    }

    if (!checkUploadLimit(pdfFiles.length)) {
      return;
    }

    setIsLoading(true);
    try {
      const pdfs = await Promise.all(
        pdfFiles.map(async (f) => {
          const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as ArrayBuffer);
            reader.onerror = () => reject(new Error(`Không thể đọc file ${f.name}`));
            reader.readAsArrayBuffer(f);
          });
          return { data: buffer, name: f.name };
        })
      );
      startQueue(pdfs);
    } catch (e: any) {
      onError(`Lỗi đọc tệp: ${e.message}`);
      setIsLoading(false);
    }
  };

  const parsePdfViaBackend = async (buffer: ArrayBuffer, pass: string): Promise<RawRow[]> => {
    const arrayBufferToBase64 = (buf: ArrayBuffer): string => {
      let binary = '';
      const bytes = new Uint8Array(buf);
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return window.btoa(binary);
    };

    const base64 = arrayBufferToBase64(buffer);
    const response = await fetch('/api/parse-pdf', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fileBase64: base64, password: pass })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const errMsg = errData.error || 'Lỗi không xác định từ Backend';
      throw new Error(errMsg);
    }

    const data = await response.json();
    return data.rawRows;
  };

  // Try to decrypt and parse the PDF
  const tryDecryptPDF = async (buffer: ArrayBuffer, name: string, pass: string) => {
    setIsLoading(true);
    try {
      let rows: RawRow[] = [];
      let usedPass = pass;

      if (pass !== '') {
        // A specific password was supplied (manually entered by user)
        rows = await parsePdfViaBackend(buffer, pass);
      } else {
        // Try without password first
        try {
          rows = await parsePdfViaBackend(buffer, '');
          usedPass = '';
        } catch (e: any) {
          if (e.message === 'PASSWORD_REQUIRED') {
            // Try with saved bank passwords!
            const savedPasswordsMap = getBankPasswords();
            const savedPasswords = Array.from(new Set(Object.values(savedPasswordsMap)));
            let success = false;

            for (const savedPass of savedPasswords) {
              if (!savedPass) continue;
              try {
                rows = await parsePdfViaBackend(buffer, savedPass);
                usedPass = savedPass;
                success = true;
                break;
              } catch (err) {
                // Ignore and try next saved password
              }
            }

            if (!success) {
              // Rethrow the original password required error
              throw e;
            }
          } else {
            throw e;
          }
        }
      }

      setRawRows(rows);

      // Extract current selection and reset state immediately to prevent leakage to subsequent files in queue
      const currentSelectedTemplateId = selectedTemplateId;
      if (setSelectedTemplateId) {
        setSelectedTemplateId('');
      }

      let detection: { bank: string; mapping: ColumnMapping | null; templateId: string | null } = {
        bank: 'Generic',
        mapping: null,
        templateId: null
      };

      if (currentSelectedTemplateId) {
        const matchedTemplate = globalTemplates.find(gt => gt.id === currentSelectedTemplateId);
        if (matchedTemplate) {
          detection = {
            bank: matchedTemplate.bankName,
            mapping: {
              dateCol: matchedTemplate.dateColIndex,
              amountCol: matchedTemplate.amountColIndex,
              descCol: matchedTemplate.descColIndex,
              debitCol: matchedTemplate.debitColIndex,
              creditCol: matchedTemplate.creditColIndex
            },
            templateId: matchedTemplate.id
          };
        }
      } else {
        // Auto-detect template by scanning templates from database
        detection = detectTemplateAndMapping(rows, globalTemplates);
      }

      const matchedTemplateId = detection.templateId || '';
      const finalFileName = name.toLowerCase().includes(detection.bank.toLowerCase())
        ? name
        : `${detection.bank} - ${name}`;
      // Extract benefits metadata
      let availableBenefits = 0;
      let thisMonthBenefits = 0;
      rows.forEach(row => {
        const text = row.cells.join(' ').toLowerCase();
        if (text.includes('ưu đãi hiện có') || text.includes('available benefit') || text.includes('available cashback') || text.includes('ưu đãi lũy kế')) {
          for (let i = row.cells.length - 1; i >= 0; i--) {
            const val = Math.abs(parseAmount(row.cells[i]));
            if (val > 0) {
              availableBenefits = val;
              break;
            }
          }
        }
        if (text.includes('ưu đãi tháng này') || text.includes('this month\'s benefit') || text.includes('this month benefit') || text.includes('this month cashback') || text.includes('ưu đãi phát sinh')) {
          for (let i = row.cells.length - 1; i >= 0; i--) {
            const val = Math.abs(parseAmount(row.cells[i]));
            if (val > 0) {
              thisMonthBenefits = val;
              break;
            }
          }
        }
      });

      // Save statement to IndexedDB respecting privacy settings
      const settings = getAppSettings();
      if (settings.privacyMode !== 'temporary') {
        try {
          const fileData = settings.privacyMode === 'aggregate' ? new ArrayBuffer(0) : buffer;
          const filePassword = settings.privacyMode === 'aggregate' ? '' : usedPass;

          await savePdfStatement({
            id: finalFileName + '_' + buffer.byteLength,
            name: finalFileName,
            bank: detection.bank,
            size: buffer.byteLength,
            data: fileData,
            password: filePassword,
            sourceType: externalPDFs ? 'drive' : 'upload',
            availableBenefits,
            thisMonthBenefits,
            templateId: matchedTemplateId || undefined
          });
        } catch (err) {
          console.error('Error saving statement PDF to IndexedDB:', err);
        }
      }

      // If we used a password and user wants to save it:
      if (usedPass !== '' && savePasswordCheckbox) {
        const saved = getBankPasswords();
        saved[detection.bank] = usedPass;
        saveBankPasswords(saved);
      }

      setShowPasswordModal(false);

      if (detection.mapping) {
        // Auto parse transactions
        const parsed = parseTransactionsFromRaw(rows, detection.mapping, detection.bank, finalFileName);
        if (parsed.length > 0) {
          // Save matched/auto-detected templates to Firestore sharing database if not already saved
          const isAlreadySaved = globalTemplates.some(gt => gt.id === matchedTemplateId);
          if (!isAlreadySaved) {
            const finalTemplateId = matchedTemplateId === 'predefined_shinhan_bank'
              ? 'shinhan_bank_default_default'
              : (matchedTemplateId || `${detection.bank.toLowerCase().replace(/[^a-z0-9]/g, '_')}_default_default`);

            const newTemplate: BankMappingTemplate = {
              id: finalTemplateId,
              bankName: detection.bank,
              cardType: 'Mặc định',
              cardClass: 'Mặc định',
              dateColIndex: detection.mapping.dateCol,
              amountColIndex: detection.mapping.amountCol ?? -1,
              debitColIndex: detection.mapping.debitCol,
              creditColIndex: detection.mapping.creditCol,
              descColIndex: detection.mapping.descCol,
              hasHeader: true,
              updatedAt: new Date().toISOString()
            };
            onSaveGlobalTemplate(newTemplate).catch(console.error);

            // Dynamically register the newly detected bank globally if it is not in the list
            if (!globalBanks.includes(detection.bank)) {
              saveGlobalBank(detection.bank).catch(console.error);
            }
          }
          handleParsedBatch(parsed, finalFileName);
        } else {
          setIsMappingMode(true);
          setIsLoading(false);
        }
      } else {
        setIsMappingMode(true);
        setIsLoading(false);
      }
    } catch (e: any) {
      setIsLoading(false);
      if (e.message === 'PASSWORD_REQUIRED') {
        setShowPasswordModal(true);
        setPasswordError('');
      } else if (e.message === 'INCORRECT_PASSWORD') {
        setShowPasswordModal(true);
        setPasswordError('Mật khẩu không chính xác, vui lòng thử lại.');
      } else {
        onError(`Không thể phân tích PDF: ${e.message}`);
        resetQueue();
      }
    }
  };

  // Handles parsed batch transactions and proceeds to the next file in the queue
  const handleParsedBatch = (parsedTxs: Transaction[], filename: string) => {
    const nextAccumulated = [...accumulatedTransactions, ...parsedTxs];
    setAccumulatedTransactions(nextAccumulated);

    const nextIndex = currentFileIndex + 1;
    setCurrentFileIndex(nextIndex);

    if (nextIndex < fileQueue.length) {
      // Process next file
      const nextFile = fileQueue[nextIndex];
      setFile(new File([nextFile.data], nextFile.name, { type: 'application/pdf' }));
      setFileData(nextFile.data);

      // Reset parser UI states for the next file
      setRawRows([]);
      setPassword('');
      setPasswordError('');
      setShowPasswordModal(false);
      setIsMappingMode(false);

      // Attempt decryption
      tryDecryptPDF(nextFile.data, nextFile.name, '');
    } else {
      // All files processed successfully!
      const label = totalFiles > 1
        ? `Nhập tổng hợp từ ${totalFiles} tệp`
        : filename;

      incrementUploadCounter(totalFiles).then(() => {
        onTransactionsParsed(nextAccumulated, label);
        resetQueue();
      }).catch((err) => {
        console.error(err);
        onTransactionsParsed(nextAccumulated, label);
        resetQueue();
      });
    }
  };

  // Resets the queue state completely
  const resetQueue = () => {
    setIsLoading(false);
    setFile(null);
    setFileData(null);
    setFileQueue([]);
    setAccumulatedTransactions([]);
    setCurrentFileIndex(0);
    setTotalFiles(0);
    setShowPasswordModal(false);
    setIsMappingMode(false);
    if (onClearExternal) {
      onClearExternal();
    }
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('handlePasswordSubmit click triggered. fileData:', fileData, 'file:', file, 'password:', password);

    // Prioritize reading from the file queue to bypass any React state timing lags!
    const activeFile = fileQueue[currentFileIndex];
    if (activeFile) {
      console.log('Processing file from queue:', activeFile.name);
      tryDecryptPDF(activeFile.data, activeFile.name, password);
      return;
    }

    if (!fileData || !file) {
      console.warn('handlePasswordSubmit aborted: fileData or file is null');
      return;
    }
    tryDecryptPDF(fileData, file.name, password);
  };



  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Optional Template Selector */}
      {!isMappingMode && !isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxWidth: '350px' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>
              🏦 Chọn mẫu cấu hình phân tích (Tùy chọn):
            </label>
            <select
              className="input-field"
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              style={{ fontSize: '0.85rem', padding: '0.5rem 0.75rem' }}
            >
              <option value="">-- Tự động nhận diện cấu hình --</option>
              {globalTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.bankName} - {t.cardType || 'Mặc định'} {t.cardClass || 'Mặc định'}
                </option>
              ))}
            </select>
          </div>

          {/* Configuration Preview Panel */}
          {(() => {
            const selectedTemplate = selectedTemplateId === 'predefined_shinhan_bank'
              ? {
                bankName: 'Shinhan Bank',
                cardType: 'Mặc định',
                cardClass: 'Mặc định',
                dateColIndex: 0,
                descColIndex: 1,
                amountColIndex: 1,
                debitColIndex: undefined as number | undefined,
                creditColIndex: undefined as number | undefined,
                hasHeader: true
              }
              : globalTemplates.find(t => t.id === selectedTemplateId);

            if (!selectedTemplate) return null;

            return (
              <div style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--border-radius-md)',
                padding: '0.85rem 1rem',
                maxWidth: '500px',
                fontSize: '0.8rem',
                color: 'var(--text-secondary)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem'
              }}>
                <div style={{ fontWeight: '700', color: 'var(--text-primary)', marginBottom: '0.15rem' }}>
                  🔍 Xem trước cấu hình cột ({selectedTemplate.bankName}):
                </div>
                <div>• 📅 Cột Ngày giao dịch: <strong>Cột {selectedTemplate.dateColIndex}</strong></div>
                <div>• 📝 Cột Nội dung: <strong>Cột {selectedTemplate.descColIndex}</strong></div>
                {selectedTemplate.amountColIndex !== -1 ? (
                  <div>• 💵 Cột Số tiền: <strong>Cột {selectedTemplate.amountColIndex}</strong></div>
                ) : (
                  <>
                    <div>• 💸 Cột Ghi nợ (-): <strong>Cột {selectedTemplate.debitColIndex}</strong></div>
                    <div>• 💰 Cột Ghi có (+): <strong>Cột {selectedTemplate.creditColIndex}</strong></div>
                  </>
                )}
                <div>• 📌 Tiêu đề cột: <strong>{selectedTemplate.hasHeader ? 'Có' : 'Không'}</strong></div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Upload Drag & Drop Area */}
      {!isMappingMode && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {isLoading ? (
            <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3.5rem 2rem', gap: '1rem' }}>
              <Loader2 className="animate-spin" size={36} color="var(--color-info)" />
              <p style={{ fontWeight: '600', fontSize: '1rem', color: 'var(--text-primary)', textAlign: 'center' }}>
                {totalFiles > 1
                  ? `Đang giải mã & phân tích tệp ${currentFileIndex + 1}/${totalFiles}: ${file?.name}...`
                  : `Đang giải mã & phân tích tệp ${file?.name || 'PDF'}...`}
              </p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Vui lòng không đóng trình duyệt. Dữ liệu đang được xử lý cục bộ.
              </p>
            </div>
          ) : (
            <div
              className="dropzone theme-transition"
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{ padding: '3rem 2rem' }}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="application/pdf"
                multiple // Support local multi-selection
                style={{ display: 'none' }}
              />

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                <div style={{ backgroundColor: 'rgba(99, 102, 241, 0.1)', padding: '1rem', borderRadius: '50%' }}>
                  <Upload size={32} color="var(--color-primary)" />
                </div>

                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontWeight: '700', fontSize: '1.1rem', marginBottom: '0.25rem' }}>
                    Kéo thả hoặc Click để tải lên file PDF sao kê
                  </p>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Hỗ trợ tải lên **nhiều file sao kê** cùng lúc.
                  </p>
                </div>

                <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.5rem' }}>
                  Hỗ trợ giải mã tệp PDF có mật khẩu. Dữ liệu bảo mật 100%
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Password Modal */}
      {showPasswordModal && (
        <div className="modal-overlay">
          <div className="modal-content animate-fade-in">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--color-danger)' }}>
              <Lock size={24} />
              <h3>Tệp PDF bị khóa mật khẩu</h3>
            </div>

            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              Tệp <strong>{file?.name}</strong> {totalFiles > 1 ? `(Tệp ${currentFileIndex + 1} trên tổng số ${totalFiles})` : ''} được bảo vệ. Vui lòng nhập mật khẩu để mở khóa.
              <br />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', display: 'block', marginTop: '0.5rem' }}>
                *Lưu ý: Mật khẩu sao kê thường là CCCD, Số điện thoại hoặc Ngày sinh của bạn tùy thuộc vào ngân hàng.
              </span>
            </p>

            <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ position: 'relative' }}>
                <input
                  type="password"
                  placeholder="Nhập mật khẩu PDF"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  id="savePasswordCheckbox"
                  checked={savePasswordCheckbox}
                  onChange={(e) => setSavePasswordCheckbox(e.target.checked)}
                  style={{ width: 'auto', margin: 0, cursor: 'pointer' }}
                />
                <label htmlFor="savePasswordCheckbox" style={{ fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                  Lưu mật khẩu cho ngân hàng này để áp dụng tự động cho lần sau
                </label>
              </div>

              {passwordError && (
                <div style={{ color: 'var(--color-danger)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <AlertCircle size={14} />
                  {passwordError}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={resetQueue}
                >
                  Hủy tất cả
                </button>
                <button type="submit" className="btn btn-primary" disabled={isLoading}>
                  {isLoading ? <Loader2 className="animate-spin" size={16} /> : <Unlock size={16} />}
                  Giải mã
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Column Mapping Configuration UI */}
      {isMappingMode && rawRows.length > 0 && (
        <ColumnMapper
          rawRows={rawRows.map(r => r.cells)}
          pdfBuffer={fileData || undefined}
          onCancel={resetQueue}
          existingBanks={globalBanks}
          onApply={async (customMap) => {
            const map: ColumnMapping = {
              dateCol: customMap.dateColIndex,
              amountCol: customMap.amountColIndex,
              descCol: customMap.descColIndex,
              debitCol: customMap.debitColIndex,
              creditCol: customMap.creditColIndex,
            };
            const parsed = parseTransactionsFromRaw(rawRows, map, customMap.bankName, file?.name || 'Custom');
            if (parsed.length === 0) {
              alert('Không có giao dịch nào được trích xuất. Vui lòng kiểm tra lại cấu hình cột.');
              return;
            }

            const templateId = `${customMap.bankName}_${customMap.cardType}_${customMap.cardClass}`.toLowerCase().replace(/[^a-z0-9]/g, '_');

            // Auto save template to Firestore sharing database
            const newTemplate: BankMappingTemplate = {
              id: templateId,
              bankName: customMap.bankName,
              cardType: customMap.cardType,
              cardClass: customMap.cardClass,
              dateColIndex: customMap.dateColIndex,
              amountColIndex: customMap.amountColIndex,
              debitColIndex: customMap.debitColIndex,
              creditColIndex: customMap.creditColIndex,
              descColIndex: customMap.descColIndex,
              hasHeader: customMap.hasHeader,
              updatedAt: new Date().toISOString()
            };
            await onSaveGlobalTemplate(newTemplate);

            // Save new bank globally if not exists
            if (!globalBanks.includes(customMap.bankName)) {
              await saveGlobalBank(customMap.bankName).catch(console.error);
            }

            // Save statement to IndexedDB with matched template ID
            const finalFileName = file?.name.toLowerCase().includes(customMap.bankName.toLowerCase())
              ? file.name
              : `${customMap.bankName} - ${file?.name}`;
            const settings = getAppSettings();
            if (settings.privacyMode !== 'temporary' && fileData) {
              try {
                const statementData = settings.privacyMode === 'aggregate' ? new ArrayBuffer(0) : fileData;
                const statementPassword = settings.privacyMode === 'aggregate' ? '' : password;
                await savePdfStatement({
                  id: finalFileName + '_' + fileData.byteLength,
                  name: finalFileName,
                  bank: customMap.bankName,
                  size: fileData.byteLength,
                  data: statementData,
                  password: statementPassword,
                  sourceType: externalPDFs ? 'drive' : 'upload',
                  templateId: templateId
                });
              } catch (err) {
                console.error('Error saving statement PDF to IndexedDB during mapping:', err);
              }
            }

            handleParsedBatch(parsed, file?.name || 'Custom');
          }}
        />
      )}

      {/* Upgrade Premium Modal */}
      {showUpgradeModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px', textAlign: 'center', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', alignItems: 'center' }}>
            <div style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', padding: '1.25rem', borderRadius: '50%', color: 'var(--color-warning)' }}>
              <DollarSign size={40} />
            </div>
            <h3 style={{ margin: 0 }}>Hạn mức upload đã hết</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6', margin: 0 }}>
              Tài khoản cơ bản chỉ giới hạn tải lên tối đa <strong>{currentUserDoc?.dailyUploadLimit} tệp/ngày</strong>.
              Vui lòng nâng cấp gói Premium để mở khóa không giới hạn upload và đồng bộ hóa dữ liệu đám mây.
            </p>
            <button
              className="btn btn-primary"
              onClick={() => {
                const stripeUrl = `https://buy.stripe.com/test_6oE00k5Fz9qUa9G3cc?client_reference_id=${encodeURIComponent(currentUserDoc?.email || '')}`;
                window.open(stripeUrl, '_blank');
              }}
              style={{ backgroundColor: 'var(--color-info)', color: 'white', width: '100%', padding: '0.75rem', fontWeight: 'bold', border: 'none' }}
            >
              Nâng cấp Premium chỉ với 2$
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setShowUpgradeModal(false)}
              style={{ width: '100%' }}
            >
              Để sau
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
