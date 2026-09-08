import { useState, useEffect, useMemo } from 'react';
import {
  BarChart3,
  ListFilter,
  Settings,
  UploadCloud,
  Database,
  Sun,
  Moon,
  AlertCircle,
  FileCheck2,
  LogOut,
  Sliders
} from 'lucide-react';

// CSS styling imports
import './App.css';

// DB utilities
import {
  getTransactions,
  saveTransactions,
  getGroups,
  saveGroups,
  getCategories,
  saveCategories,
  getRules,
  saveRules,
  clearAllData,
  getPdfStatements,
  deletePdfStatement,
  savePdfStatement,
  saveUserBanks,
  getAppSettings,
  saveAppSettings,
  getDeletedTxIds,
  saveDeletedTxIds
} from './utils/db';
import {
  isPremiumUserLocal,
  setPremiumUserLocal,
  type Transaction,
  type Group,
  type Category,
  type CategoryRule,
  type SavedStatement,
  type BankMappingTemplate
} from './utils/db';

import { extractPDFRawRows, detectTemplateAndMapping, parseTransactionsFromRaw } from './utils/pdfParser';
import type { ColumnMapping } from './utils/pdfParser';
import { findSyncFile, downloadSyncFile, uploadSyncFile } from './utils/googleDriveSync';
import {
  fetchUserDoc,
  saveUserDoc,
  fetchTemplatesWithCache,
  saveTemplateDoc,
  fetchGlobalBanks,
  type AppUser
} from './utils/bankTemplateService';

declare const google: any;

// Components
import { Dashboard } from './components/Dashboard';
import { TransactionTable } from './components/TransactionTable';
import { SettingsModal } from './components/SettingsModal';
import { FileUpload } from './components/FileUpload';
import { GoogleDriveConnector } from './components/GoogleDriveConnector';
import { AdminDashboard } from './components/AdminDashboard';

function App() {
  // Theme state
  const [theme, setTheme] = useState<string>(() => {
    return localStorage.getItem('color-scheme') || 'light';
  });

  // Global Auth states
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(() => {
    const s = getAppSettings();
    if (s.googleLoginTime && s.googleAccessToken) {
      const loginDate = new Date(s.googleLoginTime);
      const isFresh = (Date.now() - loginDate.getTime()) < 60 * 24 * 60 * 60 * 1000;
      return isFresh ? s.googleAccessToken : null;
    }
    return null;
  });

  const [googleUserEmail, setGoogleUserEmail] = useState<string | null>(() => {
    const s = getAppSettings();
    return s.googleAccountEmail || null;
  });

  const isLoggedIn = !!googleAccessToken && !!googleUserEmail;

  const [currentUserDoc, setCurrentUserDoc] = useState<AppUser | null>(null);
  const [globalTemplates, setGlobalTemplates] = useState<BankMappingTemplate[]>([]);
  const [globalBanks, setGlobalBanks] = useState<string[]>([]);

  const adminEmails = (import.meta.env.BST_ADMIN_EMAILS || import.meta.env.VITE_ADMIN_EMAILS || import.meta.env.ADMIN_EMAILS || '').toLowerCase().split(',').map((e: string) => e.trim());
  const isAdmin = googleUserEmail ? adminEmails.includes(googleUserEmail.toLowerCase()) : false;

  useEffect(() => {
    fetchTemplatesWithCache().then(setGlobalTemplates).catch(console.error);
    fetchGlobalBanks().then(setGlobalBanks).catch(console.error);
  }, []);

  useEffect(() => {
    if (googleUserEmail) {
      fetchUserDoc(googleUserEmail).then(async (doc) => {
        if (doc) {
          const updatedUser: AppUser = {
            ...doc,
            updatedAt: new Date().toISOString()
          };
          await saveUserDoc(updatedUser);
          setCurrentUserDoc(updatedUser);
          setPremiumUserLocal(googleUserEmail, doc.isPremium);
          if (doc.customBanks) {
            saveUserBanks(doc.customBanks);
          }
        } else {
          const newUser: AppUser = {
            email: googleUserEmail,
            isPremium: isPremiumUserLocal(),
            isDisabled: false,
            dailyUploadLimit: 5,
            uploadsToday: 0,
            lastUploadDate: new Date().toISOString().split('T')[0],
            updatedAt: new Date().toISOString()
          };
          await saveUserDoc(newUser);
          setCurrentUserDoc(newUser);
        }
      });
    } else {
      setCurrentUserDoc(null);
    }
  }, [googleUserEmail]);

  const handleSaveGlobalTemplate = async (template: BankMappingTemplate) => {
    await saveTemplateDoc(template);
    const list = await fetchTemplatesWithCache(true);
    setGlobalTemplates(list);
  };

  const incrementUploadCounter = async (filesCount: number) => {
    if (!currentUserDoc) return true;

    const todayStr = new Date().toISOString().split('T')[0];
    let uploadsToday = currentUserDoc.uploadsToday;
    if (currentUserDoc.lastUploadDate !== todayStr) {
      uploadsToday = 0;
    }

    const updated: AppUser = {
      ...currentUserDoc,
      uploadsToday: uploadsToday + filesCount,
      lastUploadDate: todayStr,
      updatedAt: new Date().toISOString()
    };
    setCurrentUserDoc(updated);
    await saveUserDoc(updated);
    return true;
  };

  const handleGlobalGoogleLogin = () => {
    if (typeof google === 'undefined') {
      showError('Google SDK chưa được tải xong. Vui lòng thử lại sau vài giây.');
      return;
    }
    const clientId = import.meta.env.BST_GOOGLE_CLIENT_ID || import.meta.env.VITE_GOOGLE_CLIENT_ID || import.meta.env.GOOGLE_CLIENT_ID || '';
    if (!clientId) {
      showError('Vui lòng cấu hình BST_GOOGLE_CLIENT_ID trong file .env hoặc trên Vercel.');
      return;
    }

    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId.trim(),
      scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
      callback: (tokenResponse: any) => {
        if (tokenResponse.error) {
          showError(`Đăng nhập thất bại: ${tokenResponse.error}`);
          return;
        }
        if (tokenResponse.access_token) {
          setGoogleAccessToken(tokenResponse.access_token);

          fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
          })
            .then(res => res.json())
            .then(userInfo => {
              const email = userInfo.email || 'Google Account';
              setGoogleUserEmail(email);

              const s = getAppSettings();
              s.googleAccountEmail = email;
              s.googleLoginTime = new Date().toISOString();
              s.googleAccessToken = tokenResponse.access_token;
              saveAppSettings(s);
              showSuccess(`Đăng nhập thành công tài khoản ${email}!`);

              if (s.cloudSyncEnabled) {
                restoreDataFromDrive(tokenResponse.access_token, s.googleFolderId);
              }
            })
            .catch(err => {
              console.error(err);
              showError('Lỗi lấy thông tin tài khoản Google.');
            });
        }
      }
    });

    tokenClient.requestAccessToken({ prompt: 'select_account' });
  };

  const handleGlobalLogout = () => {
    if (window.confirm('Bạn có chắc chắn muốn đăng xuất tài khoản Google?')) {
      setGoogleAccessToken(null);
      setGoogleUserEmail(null);

      const s = getAppSettings();
      s.googleAccessToken = undefined;
      s.googleLoginTime = undefined;
      s.googleAccountEmail = undefined;
      saveAppSettings(s);

      showSuccess('Đã đăng xuất thành công.');
    }
  };

  // Main Data States
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [rules, setRules] = useState<CategoryRule[]>([]);
  const [statementFiles, setStatementFiles] = useState<SavedStatement[]>([]);
  const [isRebuilding, setIsRebuilding] = useState<boolean>(false);
  const [archivedPeriods, setArchivedPeriods] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('bst_archived_periods');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const handleUpdateArchivedPeriods = (periods: string[]) => {
    setArchivedPeriods(periods);
    localStorage.setItem('bst_archived_periods', JSON.stringify(periods));
  };

  // Navigation
  const [activeTab, setActiveTab] = useState<string>(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash.replace('#', '') : '';
    const validTabs = ['dashboard', 'transactions', 'import-file', 'import-drive', 'admin'];
    return validTabs.includes(hash) ? hash : 'dashboard';
  });
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [selectedStatement, setSelectedStatement] = useState<string>('all');
  const [externalPDFs, setExternalPDFs] = useState<{ data: ArrayBuffer; name: string }[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  // Error Alert State
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  const reloadAndParseAllStatements = async (currentTxs: Transaction[]) => {
    setIsRebuilding(true);
    try {
      const files = await getPdfStatements();
      setStatementFiles(files);

      const allTxs: Transaction[] = [];

      for (const file of files) {
        try {
          const rows = await extractPDFRawRows(file.data, file.password || '');
          let bankName = 'Generic';
          let mapping: ColumnMapping | null = null;

          if (file.templateId) {
            const template = globalTemplates.find(t => t.id === file.templateId);
            if (template) {
              bankName = template.bankName;
              mapping = {
                dateCol: template.dateColIndex,
                amountCol: template.amountColIndex,
                descCol: template.descColIndex,
                debitCol: template.debitColIndex,
                creditCol: template.creditColIndex
              };
            }
          }

          if (!mapping) {
            const detection = detectTemplateAndMapping(rows, globalTemplates);
            bankName = detection.bank;
            mapping = detection.mapping;
          }

          if (mapping) {
            const parsed = parseTransactionsFromRaw(rows, mapping, bankName, file.name);
            allTxs.push(...parsed);
          }
        } catch (err) {
          console.error(`Failed to parse saved file ${file.name}:`, err);
        }
      }

      // Preserve manual updates (categories, groups, split states) keyed by transaction ID
      const txMap = new Map(currentTxs.map(t => [t.id, t]));
      const finalTxs: Transaction[] = [];
      const deletedIds = new Set(getDeletedTxIds());

      allTxs.forEach(pt => {
        if (deletedIds.has(pt.id)) {
          // Ignore deleted transactions
          return;
        }
        if (txMap.has(pt.id)) {
          finalTxs.push(txMap.get(pt.id)!);
          txMap.delete(pt.id);
        } else {
          // New transaction, auto categorize it
          const [cat] = autoCategorize([pt]);
          finalTxs.push(cat);
        }
      });

      // Keep any manual transactions (without statementId or source file is not in list)
      const activeStatementIds = new Set(files.map(f => f.name + '_' + f.size));
      txMap.forEach(et => {
        if (!et.statementId || !activeStatementIds.has(et.statementId)) {
          finalTxs.push(et);
        }
      });

      setTransactions(finalTxs);
      saveTransactions(finalTxs);
    } catch (err) {
      console.error('Error auto-parsing files on reload:', err);
    } finally {
      setIsRebuilding(false);
    }
  };

  const handleDeleteStatement = async (statementId: string, filename: string) => {
    if (window.confirm(`Bạn có chắc chắn muốn xóa tệp sao kê ${filename}? Tất cả giao dịch tương ứng sẽ bị xóa.`)) {
      try {
        await deletePdfStatement(statementId);

        // Remove transactions associated with this statement
        const txsToRemove = transactions.filter(t => t.statementId === statementId);
        const idsToRemove = txsToRemove.map(t => t.id);

        const updatedTxs = transactions.filter(t => t.statementId !== statementId);
        setTransactions(updatedTxs);
        saveTransactions(updatedTxs);

        // Remove from deleted list so if they re-upload the file, we get them back
        const deletedIds = getDeletedTxIds();
        const updatedDeletedIds = deletedIds.filter(id => !idsToRemove.includes(id));
        saveDeletedTxIds(updatedDeletedIds);

        // Refresh files list
        const files = await getPdfStatements();
        setStatementFiles(files);

        showSuccess(`Đã xóa tệp sao kê ${filename} và các giao dịch liên quan.`);
      } catch (err) {
        console.error('Failed to delete statement file:', err);
        setErrorMsg('Không thể xóa tệp sao kê.');
      }
    }
  };

  const handleRenameStatement = async (statementId: string, oldName: string) => {
    const newName = window.prompt('Nhập tên mới cho tệp sao kê:', oldName);
    if (!newName || !newName.trim() || newName.trim() === oldName) return;

    const cleanNewName = newName.trim();
    setIsRebuilding(true);
    try {
      const files = await getPdfStatements();
      const file = files.find(f => f.id === statementId);

      if (file) {
        // Delete the old record
        await deletePdfStatement(statementId);

        // Save the new record with updated name and new ID
        const newId = cleanNewName + '_' + file.size;

        await savePdfStatement({
          id: newId,
          name: cleanNewName,
          bank: file.bank,
          size: file.size,
          data: file.data,
          password: file.password
        });

        // Update all transactions' statementId in state & storage
        const updatedTxs = transactions.map(t => {
          if (t.statementId === oldName) {
            return { ...t, statementId: cleanNewName };
          }
          return t;
        });
        setTransactions(updatedTxs);
        saveTransactions(updatedTxs);

        // Refresh files list
        const refreshedFiles = await getPdfStatements();
        setStatementFiles(refreshedFiles);

        showSuccess(`Đã đổi tên tệp sao kê thành "${cleanNewName}".`);
      }
    } catch (err) {
      console.error('Failed to rename statement file:', err);
      setErrorMsg('Không thể đổi tên tệp sao kê.');
    } finally {
      setIsRebuilding(false);
    }
  };

  const handleUpdatePrivacyMode = (mode: 'temporary' | 'aggregate' | 'full') => {
    const s = getAppSettings();
    s.privacyMode = mode;
    saveAppSettings(s);

    saveTransactions(transactions);

    if (mode === 'temporary' || mode === 'aggregate') {
      statementFiles.forEach(async (f) => {
        const cleaned = {
          ...f,
          data: new ArrayBuffer(0),
          password: ''
        };
        await savePdfStatement(cleaned);
      });
      getPdfStatements().then(setStatementFiles);
    }
  };

  const handleUpdateCloudSync = (enabled: boolean) => {
    const s = getAppSettings();
    s.cloudSyncEnabled = enabled;
    saveAppSettings(s);

    if (enabled) {
      if (s.googleAccessToken) {
        // Push current database state
        triggerCloudSync(transactions, categories, groups, rules);
        // Ask to restore from remote if it already exists
        restoreDataFromDrive(s.googleAccessToken, s.googleFolderId);
      } else {
        showError('Vui lòng kết nối tài khoản Google Drive ở tab "Lấy từ Drive" trước khi kích hoạt đồng bộ hóa đám mây.');
      }
    }
  };

  const triggerCloudSync = async (
    txs = transactions,
    cats = categories,
    grps = groups,
    rls = rules
  ) => {
    const settings = getAppSettings();
    if (!settings.cloudSyncEnabled || !settings.googleAccessToken) return;

    const syncData = {
      transactions: txs,
      categories: cats,
      groups: grps,
      rules: rls,
      statementsMeta: statementFiles.map(f => ({
        id: f.id,
        name: f.name,
        bank: f.bank,
        size: f.size,
        importedAt: f.importedAt,
        sourceType: f.sourceType,
        availableBenefits: f.availableBenefits,
        thisMonthBenefits: f.thisMonthBenefits
      })),
      updatedAt: new Date().toISOString()
    };

    try {
      const fileId = await findSyncFile(settings.googleAccessToken, settings.googleFolderId);
      await uploadSyncFile(settings.googleAccessToken, settings.googleFolderId, fileId, syncData);
      console.log('Database synced successfully to Google Drive!');
    } catch (e) {
      console.error('Failed to sync database to Google Drive:', e);
    }
  };

  const restoreDataFromDrive = async (accessToken: string, folderId?: string) => {
    try {
      const fileId = await findSyncFile(accessToken, folderId);
      if (fileId) {
        const syncData = await downloadSyncFile(accessToken, fileId);
        if (syncData) {
          if (window.confirm(`Phát hiện dữ liệu đồng bộ đám mây từ Google Drive (Cập nhật lúc: ${new Date(syncData.updatedAt).toLocaleString('vi-VN')}). Bạn có muốn tải về và khôi phục dữ liệu để đồng bộ hóa không?`)) {
            if (syncData.transactions) {
              setTransactions(syncData.transactions);
              saveTransactions(syncData.transactions);
            }
            if (syncData.categories) {
              setCategories(syncData.categories);
              saveCategories(syncData.categories);
            }
            if (syncData.groups) {
              setGroups(syncData.groups);
              saveGroups(syncData.groups);
            }
            if (syncData.rules) {
              setRules(syncData.rules);
              saveRules(syncData.rules);
            }

            if (syncData.statementsMeta) {
              for (const f of syncData.statementsMeta) {
                const currentFiles = await getPdfStatements();
                if (!currentFiles.find(item => item.id === f.id)) {
                  await savePdfStatement({
                    id: f.id,
                    name: f.name,
                    bank: f.bank,
                    size: f.size,
                    data: new ArrayBuffer(0),
                    password: '',
                    importedAt: f.importedAt,
                    sourceType: f.sourceType,
                    availableBenefits: f.availableBenefits,
                    thisMonthBenefits: f.thisMonthBenefits
                  });
                }
              }
              const refreshedFiles = await getPdfStatements();
              setStatementFiles(refreshedFiles);
            }
            showSuccess('Đồng bộ hóa dữ liệu đám mây thành công!');
          }
        }
      }
    } catch (e) {
      console.error('Failed to restore sync data:', e);
    }
  };

  // Debounced auto sync to Google Drive on state changes
  useEffect(() => {
    const settings = getAppSettings();
    if (settings.cloudSyncEnabled && settings.googleAccessToken) {
      const timer = setTimeout(() => {
        triggerCloudSync(transactions, categories, groups, rules);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [transactions, categories, groups, rules, statementFiles]);

  // Load initial data
  useEffect(() => {
    const initialTxs = getTransactions();
    setTransactions(initialTxs);
    setGroups(getGroups());
    setCategories(getCategories());
    setRules(getRules());

    // Apply theme
    document.documentElement.setAttribute('data-theme', theme);

    // Auto-parse saved PDFs on reload
    reloadAndParseAllStatements(initialTxs);

    // Check Google Login session age
    const s = getAppSettings();
    if (s.googleLoginTime && s.googleAccountEmail) {
      const loginDate = new Date(s.googleLoginTime);
      const daysSinceLogin = Math.floor((Date.now() - loginDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceLogin >= 50 && daysSinceLogin < 60) {
        showError(`Phiên kết nối Google Drive (${s.googleAccountEmail}) sắp hết hạn (Đăng nhập cách đây ${daysSinceLogin} ngày). Vui lòng đăng nhập lại ở tab Drive để gia hạn.`);
      } else if (daysSinceLogin >= 60) {
        // Expired! Clear login info
        s.googleAccessToken = undefined;
        s.googleLoginTime = undefined;
        saveAppSettings(s);
      }
    }

    if (s.cloudSyncEnabled && s.googleAccessToken) {
      restoreDataFromDrive(s.googleAccessToken, s.googleFolderId);
    }
  }, []);

  // Listen to hash changes for tab navigation
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      const validTabs = ['dashboard', 'transactions', 'import-file', 'import-drive', 'admin'];
      if (validTabs.includes(hash)) {
        setActiveTab(hash);
      } else {
        window.location.hash = 'dashboard';
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    // Initial check
    if (!window.location.hash) {
      window.location.hash = 'dashboard';
    } else {
      handleHashChange();
    }
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Theme change effect
  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('color-scheme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    const meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) {
      meta.setAttribute('content', newTheme);
    }
  };

  const handleDrivePDFsLoaded = (pdfs: { data: ArrayBuffer; name: string }[]) => {
    setExternalPDFs(pdfs);
    window.location.hash = 'import-file';
  };

  // Automatically categorize new transactions based on current rules
  const autoCategorize = (txs: Transaction[], currentRules = rules): Transaction[] => {
    return txs.map(tx => {
      const descLower = tx.description.toLowerCase();
      // Find first rule that matches keyword in transaction description
      const matchingRule = currentRules.find(r => descLower.includes(r.keyword.toLowerCase()));
      if (matchingRule) {
        return {
          ...tx,
          category: matchingRule.categoryId
        };
      }
      return tx;
    });
  };

  // Callbacks for data updates
  const handleTransactionsParsed = (newTxs: Transaction[], _statementName: string) => {
    // Exclude duplicates by checking if id already exists
    const existingIds = new Set(transactions.map(t => t.id));
    const uniqueNewTxs = newTxs.filter(t => !existingIds.has(t.id));

    if (uniqueNewTxs.length === 0) {
      setErrorMsg('Tất cả giao dịch trong file sao kê này đã được tải lên trước đó.');
      return;
    }

    // Apply auto-categorization
    const categorizedNewTxs = autoCategorize(uniqueNewTxs);

    const merged = [...transactions, ...categorizedNewTxs];
    setTransactions(merged);
    saveTransactions(merged);

    // Refresh statement files list
    getPdfStatements().then(files => setStatementFiles(files)).catch(console.error);

    // Auto set statement selection to 'all' so that newly imported transactions are visible immediately
    setSelectedStatement('all');
    window.location.hash = 'transactions';
    showSuccess(`Đã import thành công ${categorizedNewTxs.length} giao dịch mới!`);
  };

  const handleUpdateTransactions = (updatedTxs: Transaction[]) => {
    const updatedMap = new Map(updatedTxs.map(t => [t.id, t]));
    const merged = transactions.map(t => updatedMap.get(t.id) || t);

    // Check for newly added items (e.g., from splits)
    updatedTxs.forEach(t => {
      if (!transactions.find(existing => existing.id === t.id)) {
        merged.push(t);
      }
    });

    setTransactions(merged);
    saveTransactions(merged);
  };

  const handleDeleteTransactions = (idsToDelete: string[]) => {
    const filtered = transactions.filter(t => !idsToDelete.includes(t.id));
    setTransactions(filtered);
    saveTransactions(filtered);

    // Save deleted IDs so they don't get recreated when re-parsing PDF on reload
    const deletedIds = getDeletedTxIds();
    const newDeletedIds = Array.from(new Set([...deletedIds, ...idsToDelete]));
    saveDeletedTxIds(newDeletedIds);

    showSuccess(`Đã xóa ${idsToDelete.length} giao dịch.`);
  };



  const handleCreateGroup = (name: string, txIds: string[]) => {
    const groupId = `group_${Date.now()}`;
    const newGroup: Group = {
      id: groupId,
      name,
      excludeFromPersonal: true,
    };

    const newGroups = [...groups, newGroup];
    setGroups(newGroups);
    saveGroups(newGroups);

    // Update transactions in the group to inherit the group's exclude status
    const updatedTxs = transactions.map(t =>
      txIds.includes(t.id) ? { ...t, groupId, excludeFromPersonal: true } : t
    );
    setTransactions(updatedTxs);
    saveTransactions(updatedTxs);
    showSuccess(`Đã tạo nhóm "${name}" và gán ${txIds.length} giao dịch thành công!`);
  };

  const handleUpdateRules = (updatedRules: CategoryRule[]) => {
    setRules(updatedRules);
    saveRules(updatedRules);
  };

  const handleUpdateCategories = (updatedCategories: Category[]) => {
    setCategories(updatedCategories);
    saveCategories(updatedCategories);

    // If a custom category is deleted, update corresponding transactions to 'others'
    const catIds = new Set(updatedCategories.map(c => c.id));
    const updatedTxs = transactions.map(t =>
      !catIds.has(t.category) ? { ...t, category: 'others' } : t
    );
    setTransactions(updatedTxs);
    saveTransactions(updatedTxs);
  };

  const handleAddRule = (keyword: string, categoryId: string) => {
    const newRule: CategoryRule = {
      id: `rule_${Date.now()}`,
      keyword: keyword.toLowerCase(),
      categoryId,
    };
    const newRules = [...rules, newRule];
    setRules(newRules);
    saveRules(newRules);
    showSuccess(`Đã thêm quy tắc tự động: Chứa "${keyword}" -> "${categories.find(c => c.id === categoryId)?.name}"`);
  };

  // Run all rules against all existing transactions
  const handleApplyRulesToAll = () => {
    const updated = autoCategorize(transactions);
    setTransactions(updated);
    saveTransactions(updated);
    showSuccess('Đã phân loại lại toàn bộ các giao dịch theo quy tắc hiện tại.');
  };

  // Notification helpers
  const showError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(''), 5000);
  };

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const handleResetData = async () => {
    if (window.confirm('Bạn có chắc chắn muốn xóa toàn bộ dữ liệu (bao gồm tất cả giao dịch, tệp sao kê đã tải lên, nhóm và quy tắc)? Cấu hình kết nối Google Drive và Tài khoản sẽ được giữ lại.')) {
      await clearAllData();
      setTransactions([]);
      setGroups([]);
      setRules([]);
      setCategories(getCategories());
      setStatementFiles([]);
      setSelectedStatement('all');
      showSuccess('Đã đặt lại dữ liệu thành công!');
    }
  };

  const statementPeriods = useMemo(() => {
    const periods = statementFiles.map(f => {
      const d = new Date(f.importedAt);
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const y = d.getFullYear();
      return {
        key: `${m}-${y}`,
        label: `Tháng ${m} / ${y}`
      };
    });
    const unique = new Map(periods.map(p => [p.key, p]));
    return Array.from(unique.values()).sort((a, b) => b.key.localeCompare(a.key));
  }, [statementFiles]);

  const filteredTransactions = useMemo(() => {
    if (selectedStatement === 'all') {
      const archivedNamePrefixes = new Set(
        statementFiles
          .filter(f => {
            const d = new Date(f.importedAt);
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const y = String(d.getFullYear());
            return archivedPeriods.includes(`${m}-${y}`);
          })
          .map(f => f.name)
      );
      return transactions.filter(t => !archivedNamePrefixes.has(t.statementId));
    }

    const [selMonth, selYear] = selectedStatement.split('-');
    const activeFiles = statementFiles.filter(f => {
      const d = new Date(f.importedAt);
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const y = String(d.getFullYear());
      return m === selMonth && y === selYear;
    });
    const activeFileNames = new Set(activeFiles.map(f => f.name));
    return transactions.filter(t => activeFileNames.has(t.statementId));
  }, [transactions, selectedStatement, statementFiles, archivedPeriods]);

  return (
    <div className="theme-transition" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>

      {/* Premium Navigation Header */}
      <header style={{
        backgroundColor: 'var(--surface-glass)',
        backdropFilter: 'var(--backdrop-blur)',
        borderBottom: '1px solid var(--border-color)',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        <div className="app-container" style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.85rem 1.5rem',
          margin: '0 auto',
          maxWidth: '1200px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              backgroundColor: 'var(--color-primary)',
              padding: '0.5rem',
              borderRadius: 'var(--border-radius-md)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
            }}>
              <FileCheck2 size={24} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.25rem', fontWeight: '800', margin: 0, letterSpacing: '-0.03em' }}>BST Manager</h1>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', margin: 0 }}>Bank Statement Decrypt & Analyzer</p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {/* Quick stats on Header */}
            {transactions.length > 0 && (
              <div style={{ fontSize: '0.8rem', backgroundColor: 'var(--bg-secondary)', padding: '0.35rem 0.75rem', borderRadius: 'var(--border-radius-sm)', fontWeight: '600', display: 'none' }} className="md-flex">
                Đang lưu trữ {transactions.length} GD
              </div>
            )}

            {/* Theme Toggle */}
            <button
              className="btn btn-ghost"
              onClick={toggleTheme}
              style={{ padding: '0.5rem', borderRadius: 'var(--border-radius-md)' }}
              title="Đổi giao diện"
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {!isLoggedIn ? (
              <button
                className="btn btn-primary"
                onClick={handleGlobalGoogleLogin}
                style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', backgroundColor: 'var(--color-info)', color: 'white', display: 'flex', alignItems: 'center', gap: '0.25rem', borderRadius: 'var(--border-radius-md)' }}
              >
                Kết nối Google Drive
              </button>
            ) : (
              <div className="auth-dropdown-container">
                <span className="auth-email-btn">
                  {googleUserEmail}
                </span>
                <div className="auth-dropdown-menu">
                  {isAdmin && (
                    <button onClick={() => {
                      window.location.hash = 'admin';
                    }} className="auth-dropdown-item">
                      <Sliders size={14} /> Quản trị (Admin)
                    </button>
                  )}
                  <button onClick={() => setShowSettingsModal(true)} className="auth-dropdown-item">
                    <Settings size={14} /> Cài đặt hệ thống
                  </button>
                  <button onClick={handleGlobalLogout} className="auth-dropdown-item text-danger">
                    <LogOut size={14} /> Đăng xuất Google
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main app container */}
      <main className="app-container" style={{ flex: '1', display: 'flex', flexDirection: 'column' }}>

        {/* Banner messages */}
        {errorMsg && (
          <div className="glass-card animate-fade-in" style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            borderColor: 'rgba(239, 68, 68, 0.2)',
            color: 'var(--color-danger)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '1rem',
            borderRadius: 'var(--border-radius-md)'
          }}>
            <AlertCircle size={20} />
            <span style={{ fontSize: '0.9rem', fontWeight: '600' }}>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="glass-card animate-fade-in" style={{
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            borderColor: 'rgba(16, 185, 129, 0.2)',
            color: 'var(--color-success)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '1rem',
            borderRadius: 'var(--border-radius-md)'
          }}>
            <FileCheck2 size={20} />
            <span style={{ fontSize: '0.9rem', fontWeight: '600' }}>{successMsg}</span>
          </div>
        )}

        {isLoggedIn && currentUserDoc?.isDisabled ? (
          <div className="glass-card animate-fade-in" style={{ textAlign: 'center', padding: '4rem 2rem', margin: '3rem auto', maxWidth: '500px', display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: 'center' }}>
            <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: '50%', color: 'var(--color-danger)' }}>
              <AlertCircle size={48} />
            </div>
            <h2>Tài khoản bị vô hiệu hóa</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.6' }}>
              Tài khoản <strong>{googleUserEmail}</strong> của bạn đã bị vô hiệu hóa bởi Quản trị viên.
              Vui lòng liên hệ với ban quản trị hệ thống để biết thêm chi tiết.
            </p>
            <button
              className="btn btn-secondary"
              onClick={handleGlobalLogout}
              style={{ padding: '0.5rem 1.5rem' }}
            >
              Đăng xuất
            </button>
          </div>
        ) : !isLoggedIn ? (
          <div className="glass-card animate-fade-in" style={{ textAlign: 'center', padding: '4rem 2rem', margin: '3rem auto', maxWidth: '500px', display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: 'center' }}>
            <div style={{ backgroundColor: 'rgba(6, 182, 212, 0.1)', padding: '1rem', borderRadius: '50%', color: 'var(--color-info)' }}>
              <Database size={48} />
            </div>
            <h2>Chào mừng bạn đến với BST Manager</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.6' }}>
              Vui lòng kết nối tài khoản Google Drive để sử dụng đầy đủ các tính năng: phân tích sao kê, quản lý giao dịch tín dụng và đồng bộ hóa dữ liệu bảo mật trên đám mây.
            </p>
            <button
              className="btn btn-primary"
              onClick={handleGlobalGoogleLogin}
              style={{ backgroundColor: 'var(--color-info)', color: 'white', padding: '0.75rem 2rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 12px rgba(6, 182, 212, 0.2)' }}
            >
              Đăng nhập bằng Google
            </button>
          </div>
        ) : (
          <>
            {/* Tab Controls Navigation */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid var(--color-primary)',
              paddingBottom: '0.5rem',
              flexWrap: 'wrap',
              gap: '0.75rem'
            }}>
              <div className="tab-container" style={{ borderBottom: 'none', margin: 0, padding: 0 }}>
                <button className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => window.location.hash = 'dashboard'}>
                  <BarChart3 size={16} /> Dashboard
                </button>
                <button className={`tab-btn ${activeTab === 'transactions' ? 'active' : ''}`} onClick={() => window.location.hash = 'transactions'}>
                  <ListFilter size={16} /> Giao dịch
                </button>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className={`btn ${activeTab === 'import-file' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => window.location.hash = 'import-file'}
                  style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                >
                  <UploadCloud size={16} /> Tải file PDF
                </button>
                <button
                  className={`btn ${activeTab === 'import-drive' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => window.location.hash = 'import-drive'}
                  style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                >
                  <Database size={16} /> Lấy từ Drive
                </button>
              </div>
            </div>

            {/* Tab Content Rendering */}
            <div style={{ flex: '1', display: 'flex', flexDirection: 'column', marginTop: '1.5rem' }}>

              {activeTab === 'dashboard' && (
                <Dashboard
                  transactions={filteredTransactions}
                  categories={categories}
                  groups={groups}
                  selectedStatement={selectedStatement}
                  setSelectedStatement={setSelectedStatement}
                  statementFiles={statementFiles}
                  statementPeriods={statementPeriods}
                />
              )}

              {activeTab === 'transactions' && (
                <TransactionTable
                  transactions={filteredTransactions}
                  categories={categories}
                  groups={groups}
                  selectedStatement={selectedStatement}
                  setSelectedStatement={setSelectedStatement}
                  statementPeriods={statementPeriods}
                  archivedPeriods={archivedPeriods}
                  onUpdateTransactions={handleUpdateTransactions}
                  onDeleteTransactions={handleDeleteTransactions}
                  onCreateGroup={handleCreateGroup}
                  onAddRule={handleAddRule}
                  isRebuilding={isRebuilding}
                />
              )}

              {activeTab === 'import-file' && (
                <div className="glass-card animate-fade-in">
                  <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                    <h2>Nhập sao kê từ file PDF địa phương</h2>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                      Tải lên một hoặc nhiều tệp sao kê ngân hàng định dạng PDF.
                    </p>
                  </div>

                  <FileUpload
                    onTransactionsParsed={handleTransactionsParsed}
                    onError={showError}
                    externalPDFs={externalPDFs.length > 0 ? externalPDFs : null}
                    onClearExternal={() => setExternalPDFs([])}
                    currentUserDoc={currentUserDoc}
                    incrementUploadCounter={incrementUploadCounter}
                    globalTemplates={globalTemplates}
                    onSaveGlobalTemplate={handleSaveGlobalTemplate}
                    selectedTemplateId={selectedTemplateId}
                    setSelectedTemplateId={setSelectedTemplateId}
                    globalBanks={globalBanks}
                  />
                </div>
              )}

              {activeTab === 'import-drive' && (
                <div className="glass-card animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
                    <h2>Nhập sao kê từ Google Drive</h2>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                      Chọn tệp sao kê PDF trực tiếp từ tài khoản Google Drive của bạn.
                    </p>
                  </div>

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

                  <GoogleDriveConnector
                    onPDFsLoaded={handleDrivePDFsLoaded}
                    onError={showError}
                    accessToken={googleAccessToken}
                  />
                </div>
              )}

              {activeTab === 'admin' && isAdmin && (
                <AdminDashboard />
              )}

            </div>
          </>
        )}

      </main>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid var(--border-color)',
        padding: '1.25rem 0',
        textAlign: 'center',
        fontSize: '0.8rem',
        color: 'var(--text-tertiary)',
        backgroundColor: 'var(--surface-primary)',
        marginTop: '3rem'
      }}>
        <div className="app-container" style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '0 1.5rem',
          maxWidth: '1200px'
        }}>
          <span>Bank Statement Tracker © 2026. Chạy 100% offline trên trình duyệt.</span>
        </div>
      </footer>

      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        categories={categories}
        rules={rules}
        onUpdateRules={handleUpdateRules}
        onUpdateCategories={handleUpdateCategories}
        onApplyRulesToAll={handleApplyRulesToAll}
        statementFiles={statementFiles}
        isRebuilding={isRebuilding}
        onDeleteStatement={handleDeleteStatement}
        onRenameStatement={handleRenameStatement}
        onUpdatePrivacyMode={handleUpdatePrivacyMode}
        onUpdateCloudSync={handleUpdateCloudSync}
        onResetAllData={handleResetData}
        archivedPeriods={archivedPeriods}
        onUpdateArchivedPeriods={handleUpdateArchivedPeriods}
      />

    </div>
  );
}

export default App;
