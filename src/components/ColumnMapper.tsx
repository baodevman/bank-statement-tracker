import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle, Check, X, Info } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

// Set worker Src locally
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface ColumnMapperProps {
  rawRows: string[][];
  pdfBuffer?: ArrayBuffer;
  onApply: (mapping: {
    bankName: string;
    cardType: string;
    cardClass: string;
    dateColIndex: number;
    amountColIndex: number;
    debitColIndex?: number;
    creditColIndex?: number;
    descColIndex: number;
    cardColIndex?: number;
    hasHeader: boolean;
  }) => void;
  onCancel: () => void;
  existingBanks: string[];
}

export const ColumnMapper: React.FC<ColumnMapperProps> = ({
  rawRows,
  pdfBuffer,
  onApply,
  onCancel,
  existingBanks
}) => {
  const [selectedBank, setSelectedBank] = useState<string>(existingBanks[0] || 'new');
  const [customBankName, setCustomBankName] = useState('');
  const [cardType, setCardType] = useState('');
  const [cardClass, setCardClass] = useState('');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [renderError, setRenderError] = useState<string>('');

  useEffect(() => {
    if (!pdfBuffer || !canvasRef.current) return;

    let isCancelled = false;

    const renderPdfPage = async () => {
      try {
        const loadingTask = pdfjsLib.getDocument({
          data: pdfBuffer.slice(0),
        });
        const pdfDoc = await loadingTask.promise;
        if (isCancelled) return;

        const page = await pdfDoc.getPage(1);
        if (isCancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        // Render at a reasonable scale
        const viewport = page.getViewport({ scale: 1.0 });
        const parentWidth = canvas.parentElement?.clientWidth || 500;
        const scale = parentWidth / viewport.width;
        const scaledViewport = page.getViewport({ scale: scale > 1.3 ? 1.3 : scale });

        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;

        const renderContext = {
          canvasContext: context,
          viewport: scaledViewport,
          canvas: canvas
        };

        await page.render(renderContext).promise;
      } catch (err: any) {
        console.error('Failed to render PDF page on canvas:', err);
        if (!isCancelled) {
          setRenderError('Không thể hiển thị bản xem trước PDF: ' + err.message);
        }
      }
    };

    renderPdfPage();

    return () => {
      isCancelled = true;
    };
  }, [pdfBuffer]);
  
  const [dateCol, setDateCol] = useState<number>(0);
  const [showSingleAmount, setShowSingleAmount] = useState<boolean>(true);
  const [amountCol, setAmountCol] = useState<number>(1);
  const [debitCol, setDebitCol] = useState<number>(1);
  const [creditCol, setCreditCol] = useState<number>(2);
  const [descCol, setDescCol] = useState<number>(3);
  const [cardCol, setCardCol] = useState<number>(-1);
  const [hasHeader, setHasHeader] = useState(true);

  // Preview only the first 5 rows
  const previewRows = rawRows.slice(0, 5);
  const maxColumns = previewRows.reduce((max, row) => Math.max(max, row.length), 0);
  const colIndexes = Array.from({ length: maxColumns }, (_, i) => i);

  const handleApply = () => {
    const finalBank = selectedBank === 'new' ? customBankName.trim() : selectedBank;
    if (!finalBank) {
      alert('Vui lòng chọn hoặc nhập tên ngân hàng để định danh cấu hình.');
      return;
    }
    if (!cardType.trim()) {
      alert('Vui lòng nhập loại thẻ (Ví dụ: Hi-Point, Cashback) để lưu mẫu.');
      return;
    }
    if (!cardClass.trim()) {
      alert('Vui lòng nhập hạng thẻ (Ví dụ: Classic, Gold) để lưu mẫu.');
      return;
    }
    
    if (showSingleAmount) {
      if (dateCol === amountCol || dateCol === descCol || amountCol === descCol) {
        alert('Vui lòng chọn các cột dữ liệu khác nhau cho Ngày, Số tiền và Nội dung.');
        return;
      }
    } else {
      if (dateCol === debitCol || dateCol === creditCol || dateCol === descCol || debitCol === descCol || creditCol === descCol) {
        alert('Vui lòng chọn các cột dữ liệu khác nhau cho Ngày, các cột Nợ/Có và Nội dung.');
        return;
      }
    }

    onApply({
      bankName: finalBank,
      cardType: cardType.trim(),
      cardClass: cardClass.trim(),
      dateColIndex: dateCol,
      amountColIndex: showSingleAmount ? amountCol : -1,
      debitColIndex: !showSingleAmount ? debitCol : undefined,
      creditColIndex: !showSingleAmount ? creditCol : undefined,
      descColIndex: descCol,
      cardColIndex: cardCol >= 0 ? cardCol : undefined,
      hasHeader
    });
  };

  return (
    <div className="glass-card animate-fade-in" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
        <h3 style={{ fontSize: '1.1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <HelpCircle size={20} style={{ color: 'var(--color-info)' }} />
          Ánh xạ Cột Sao kê PDF thủ công
        </h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0 0' }}>
          Hệ thống không nhận diện được cấu hình mẫu của ngân hàng này. Vui lòng vừa xem bản xem trước PDF vừa chọn cột tương ứng để thiết lập.
        </p>
      </div>

      {/* Main Grid Wrapper */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: pdfBuffer ? '1.1fr 1fr' : '1fr',
        gap: '1.5rem',
        alignItems: 'start'
      }}>
        
        {/* LEFT COLUMN: PDF Page Canvas (only if pdfBuffer is present) */}
        {pdfBuffer && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--border-radius-md)',
            padding: '0.75rem',
            backgroundColor: 'var(--bg-secondary)'
          }}>
            <div style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>
              📄 Bản xem trước trang đầu tệp PDF:
            </div>
            
            {renderError ? (
              <div style={{ padding: '2rem', color: 'var(--color-danger)', fontSize: '0.85rem', textAlign: 'center' }}>
                {renderError}
              </div>
            ) : (
              <div style={{
                width: '100%',
                maxHeight: '480px',
                overflow: 'auto',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                backgroundColor: '#ffffff',
                display: 'flex',
                justifyContent: 'center',
                boxShadow: 'inset 0 0 10px rgba(0,0,0,0.05)'
              }}>
                <canvas ref={canvasRef} style={{ maxWidth: '100%', height: 'auto', display: 'block' }} />
              </div>
            )}
          </div>
        )}

        {/* RIGHT COLUMN: Configuration Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            {/* Bank selection */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: '600' }}>🏦 Ngân hàng:</label>
              <select
                className="input-field"
                value={selectedBank}
                onChange={(e) => setSelectedBank(e.target.value)}
              >
                {existingBanks.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
                <option value="new">-- Khác (Nhập mới) --</option>
              </select>
            </div>

            {selectedBank === 'new' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: '600' }}>✍️ Tên Ngân hàng mới:</label>
                <input 
                  type="text"
                  className="input-field"
                  placeholder="Ví dụ: Bản Việt, OCB..."
                  value={customBankName}
                  onChange={(e) => setCustomBankName(e.target.value)}
                />
              </div>
            )}

            {/* Card Details */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: '600' }}>💳 Loại thẻ (Ví dụ: Hi-Point, Lotte...):</label>
              <input 
                type="text"
                className="input-field"
                placeholder="Nhập loại thẻ..."
                value={cardType}
                onChange={(e) => setCardType(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: '600' }}>🎖️ Hạng thẻ (Ví dụ: Classic, Platinum...):</label>
              <input 
                type="text"
                className="input-field"
                placeholder="Nhập hạng thẻ..."
                value={cardClass}
                onChange={(e) => setCardClass(e.target.value)}
              />
            </div>

            {/* Skip Header Checkbox */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', paddingTop: '1.25rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input 
                  type="checkbox"
                  checked={hasHeader}
                  onChange={(e) => setHasHeader(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                Dòng đầu tiên là tiêu đề cột
              </label>
            </div>
          </div>

          {/* Select Column Mappings */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: '600' }}>📅 Ngày giao dịch:</label>
              <select 
                className="input-field" 
                value={dateCol} 
                onChange={(e) => setDateCol(parseInt(e.target.value, 10))}
              >
                {colIndexes.map(idx => (
                  <option key={idx} value={idx}>Cột {idx} (Ví dụ: {previewRows[hasHeader ? 1 : 0]?.[idx] || 'Trống'})</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: '600' }}>🔄 Cấu trúc cột Số tiền:</label>
              <div style={{ display: 'flex', gap: '0.75rem', height: '100%', alignItems: 'center' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                  <input 
                    type="radio" 
                    name="amountStructure" 
                    checked={showSingleAmount} 
                    onChange={() => setShowSingleAmount(true)} 
                    style={{ width: 'auto', margin: 0 }}
                  /> 
                  Gộp 1 cột
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                  <input 
                    type="radio" 
                    name="amountStructure" 
                    checked={!showSingleAmount} 
                    onChange={() => setShowSingleAmount(false)} 
                    style={{ width: 'auto', margin: 0 }}
                  /> 
                  Tách Nợ/Có
                </label>
              </div>
            </div>

            {showSingleAmount ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: '600' }}>💵 Số tiền:</label>
                <select 
                  className="input-field" 
                  value={amountCol} 
                  onChange={(e) => setAmountCol(parseInt(e.target.value, 10))}
                >
                  {colIndexes.map(idx => (
                    <option key={idx} value={idx}>Cột {idx} (Ví dụ: {previewRows[hasHeader ? 1 : 0]?.[idx] || 'Trống'})</option>
                  ))}
                </select>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: '600' }}>💸 Cột Ghi nợ (Tiền chi ra -):</label>
                  <select 
                    className="input-field" 
                    value={debitCol} 
                    onChange={(e) => setDebitCol(parseInt(e.target.value, 10))}
                  >
                    {colIndexes.map(idx => (
                      <option key={idx} value={idx}>Cột {idx} (Ví dụ: {previewRows[hasHeader ? 1 : 0]?.[idx] || 'Trống'})</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: '600' }}>💰 Cột Ghi có (Tiền nạp vào +):</label>
                  <select 
                    className="input-field" 
                    value={creditCol} 
                    onChange={(e) => setCreditCol(parseInt(e.target.value, 10))}
                  >
                    {colIndexes.map(idx => (
                      <option key={idx} value={idx}>Cột {idx} (Ví dụ: {previewRows[hasHeader ? 1 : 0]?.[idx] || 'Trống'})</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: '600' }}>📝 Chi tiết / Nội dung:</label>
              <select 
                className="input-field" 
                value={descCol} 
                onChange={(e) => setDescCol(parseInt(e.target.value, 10))}
              >
                {colIndexes.map(idx => (
                  <option key={idx} value={idx}>Cột {idx} (Ví dụ: {previewRows[hasHeader ? 1 : 0]?.[idx] || 'Trống'})</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: '600' }}>💳 Số thẻ tín dụng (Tùy chọn):</label>
              <select 
                className="input-field" 
                value={cardCol} 
                onChange={(e) => setCardCol(parseInt(e.target.value, 10))}
              >
                <option value={-1}>-- Không có / Bỏ qua --</option>
                {colIndexes.map(idx => (
                  <option key={idx} value={idx}>Cột {idx} (Ví dụ: {previewRows[hasHeader ? 1 : 0]?.[idx] || 'Trống'})</option>
                ))}
              </select>
            </div>
          </div>
          
        </div>
      </div>

      {/* Raw Data Preview Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>
          <Info size={14} /> Xem trước 5 dòng đầu từ PDF:
        </div>

        <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius-md)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                {colIndexes.map(idx => (
                  <th key={idx} style={{ padding: '0.5rem 0.75rem', fontWeight: '700', borderRight: '1px solid var(--border-color)' }}>
                    Cột {idx}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, rIdx) => (
                <tr 
                  key={rIdx} 
                  style={{ 
                    borderBottom: rIdx < previewRows.length - 1 ? '1px solid var(--border-color)' : 'none',
                    opacity: rIdx === 0 && hasHeader ? 0.5 : 1,
                    backgroundColor: rIdx === 0 && hasHeader ? 'rgba(255, 255, 255, 0.02)' : 'transparent'
                  }}
                >
                  {colIndexes.map(cIdx => (
                    <td key={cIdx} style={{ padding: '0.5rem 0.75rem', borderRight: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                      {row[cIdx] || ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Action triggers */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
        <button className="btn btn-secondary" onClick={onCancel} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <X size={16} /> Hủy bỏ
        </button>
        <button className="btn btn-primary" onClick={handleApply} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <Check size={16} /> Áp dụng và Lưu Mẫu
        </button>
      </div>

    </div>
  );
};
