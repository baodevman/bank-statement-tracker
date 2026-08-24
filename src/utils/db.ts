export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  originalAmount: number;
  category: string;
  groupId: string | null;
  excludeFromPersonal: boolean;
  isSplit: boolean;
  statementId: string;
  bank: string;
  cardType?: string | null;
  isInstallment?: boolean;
  remainingBalance?: number;
}

export interface Group {
  id: string;
  name: string;
  excludeFromPersonal: boolean;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  isCustom?: boolean;
}

export interface CategoryRule {
  id: string;
  keyword: string;
  categoryId: string;
}

const STORAGE_KEYS = {
  TRANSACTIONS: 'bst_transactions',
  GROUPS: 'bst_groups',
  CATEGORIES: 'bst_categories',
  RULES: 'bst_rules',
  THEME: 'color-scheme',
  GOOGLE_FOLDER_ID: 'bst_google_folder_id',
  BANK_PASSWORDS: 'bst_bank_passwords',
  USER_BANKS: 'bst_user_banks',
};

// Predefined default categories
export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'income', name: 'Thu nhập', color: '#10b981' }, // success
  { id: 'dining', name: 'Ăn uống', color: '#f59e0b' }, // warning
  { id: 'shopping', name: 'Mua sắm', color: '#818cf8' }, // primary
  { id: 'groceries', name: 'Siêu thị', color: '#06b6d4' }, // info
  { id: 'transport', name: 'Di chuyển', color: '#3b82f6' }, // blue
  { id: 'entertainment', name: 'Giải trí', color: '#ec4899' }, // pink
  { id: 'utilities', name: 'Hóa đơn & Dịch vụ', color: '#f43f5e' }, // rose
  { id: 'others', name: 'Khác', color: '#94a3b8' }, // text-tertiary
];

export const getGoogleFolderId = (): string => {
  return localStorage.getItem(STORAGE_KEYS.GOOGLE_FOLDER_ID) || '';
};

export const saveGoogleFolderId = (folderId: string): void => {
  localStorage.setItem(STORAGE_KEYS.GOOGLE_FOLDER_ID, folderId);
};

export const getTransactions = (): Transaction[] => {
  const data = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
  return data ? JSON.parse(data) : [];
};

export const saveTransactions = (transactions: Transaction[]): void => {
  localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
};

export const getGroups = (): Group[] => {
  const data = localStorage.getItem(STORAGE_KEYS.GROUPS);
  return data ? JSON.parse(data) : [];
};

export const saveGroups = (groups: Group[]): void => {
  localStorage.setItem(STORAGE_KEYS.GROUPS, JSON.stringify(groups));
};

export const getCategories = (): Category[] => {
  const data = localStorage.getItem(STORAGE_KEYS.CATEGORIES);
  if (!data) {
    return DEFAULT_CATEGORIES;
  }
  const parsed = JSON.parse(data) as Category[];
  // Merge predefined with custom to ensure defaults always exist
  const merged = [...DEFAULT_CATEGORIES];
  parsed.forEach(cat => {
    if (!merged.find(m => m.id === cat.id)) {
      merged.push(cat);
    }
  });
  return merged;
};

export const saveCategories = (categories: Category[]): void => {
  localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(categories));
};

export const getRules = (): CategoryRule[] => {
  const data = localStorage.getItem(STORAGE_KEYS.RULES);
  return data ? JSON.parse(data) : [];
};

export const saveRules = (rules: CategoryRule[]): void => {
  localStorage.setItem(STORAGE_KEYS.RULES, JSON.stringify(rules));
};

export const clearAllData = async (): Promise<void> => {
  // 1. Clear IndexedDB PDF statements
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error('Failed to clear IndexedDB pdf_statements store:', e);
  }

  // 2. Backup session settings & user license
  const settings = getAppSettings();
  const sessionSettings = {
    googleAccountEmail: settings.googleAccountEmail,
    googleLoginTime: settings.googleLoginTime,
    googleAccessToken: settings.googleAccessToken,
    firebaseIdToken: settings.firebaseIdToken,
    firebaseIdTokenExpiry: settings.firebaseIdTokenExpiry,
    privacyMode: 'full' as const,
    cloudSyncEnabled: false
  };
  const userLic = localStorage.getItem('bst_user_lic');
  const colorScheme = localStorage.getItem('color-scheme');

  // 3. Clear ALL localStorage
  localStorage.clear();

  // 4. Restore only login session and essential license/theme settings
  localStorage.setItem('bst_app_settings', JSON.stringify(sessionSettings));
  if (userLic) {
    localStorage.setItem('bst_user_lic', userLic);
  }
  if (colorScheme) {
    localStorage.setItem('color-scheme', colorScheme);
  }
};

export const getBankPasswords = (): Record<string, string> => {
  const data = localStorage.getItem(STORAGE_KEYS.BANK_PASSWORDS);
  return data ? JSON.parse(data) : {};
};

export const saveBankPasswords = (passwords: Record<string, string>): void => {
  localStorage.setItem(STORAGE_KEYS.BANK_PASSWORDS, JSON.stringify(passwords));
};

export const getUserBanks = (): string[] => {
  const data = localStorage.getItem(STORAGE_KEYS.USER_BANKS);
  return data ? JSON.parse(data) : [];
};

export const saveUserBanks = (banks: string[]): void => {
  localStorage.setItem(STORAGE_KEYS.USER_BANKS, JSON.stringify(banks));
};

// IndexedDB setup for storing PDF statement files
const DB_NAME = 'bst_file_db';
const DB_VERSION = 1;
const STORE_NAME = 'pdf_statements';

export interface SavedStatement {
  id: string;
  name: string;
  bank: string;
  size: number;
  data: ArrayBuffer;
  password?: string;
  importedAt: string;
  sourceType?: 'upload' | 'drive';
  availableBenefits?: number;
  thisMonthBenefits?: number;
  templateId?: string;
}

const openDb = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
};

export const savePdfStatement = async (statement: Omit<SavedStatement, 'importedAt'> & { importedAt?: string }): Promise<void> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const item: SavedStatement = {
      importedAt: new Date().toISOString(),
      ...statement
    };
    const request = store.put(item);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getPdfStatements = async (): Promise<SavedStatement[]> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

export const deletePdfStatement = async (id: string): Promise<void> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export interface AppSettings {
  privacyMode: 'temporary' | 'aggregate' | 'full';
  googleFolderId: string;
  googleAccountEmail?: string;
  googleLoginTime?: string;
  googleAccessToken?: string;
  firebaseIdToken?: string;
  firebaseIdTokenExpiry?: string;
  cloudSyncEnabled?: boolean;
  dashboardSummary?: {
    totalSpent: number;
    benefitsThisMonth: number;
    benefitsAvailable: number;
    installmentRemaining: number;
    cardBrandCounts: Record<string, number>;
    monthlySpending: Record<string, number>;
  };
}

export const getAppSettings = (): AppSettings => {
  const data = localStorage.getItem('bst_app_settings');
  if (data) {
    try {
      return JSON.parse(data);
    } catch (e) {
      console.error(e);
    }
  }
  return {
    privacyMode: 'full',
    googleFolderId: '',
    cloudSyncEnabled: false,
  };
};

export const saveAppSettings = (settings: AppSettings): void => {
  localStorage.setItem('bst_app_settings', JSON.stringify(settings));
};

export interface BankMappingTemplate {
  id: string;
  bankName: string;
  cardType?: string;
  cardClass?: string;
  dateColIndex: number;
  amountColIndex: number;
  debitColIndex?: number;
  creditColIndex?: number;
  descColIndex: number;
  cardColIndex?: number;
  hasHeader: boolean;
  updatedAt: string;
  detectKeywords?: string[];
  dateKeywords?: string[];
  descKeywords?: string[];
  amountKeywords?: string[];
  debitKeywords?: string[];
  creditKeywords?: string[];
}

export const getLocalBankMappings = (): BankMappingTemplate[] => {
  const data = localStorage.getItem('bst_local_bank_mappings');
  return data ? JSON.parse(data) : [];
};

export const saveLocalBankMappings = (mappings: BankMappingTemplate[]): void => {
  localStorage.setItem('bst_local_bank_mappings', JSON.stringify(mappings));
};

export const isPremiumUserLocal = (): boolean => {
  const encoded = localStorage.getItem('bst_user_lic');
  if (!encoded) return false;
  try {
    const decoded = atob(encoded);
    return decoded.startsWith('licensed_premium_');
  } catch {
    return false;
  }
};

export const setPremiumUserLocal = (email: string, premium: boolean): void => {
  if (premium) {
    const code = `licensed_premium_${email}_${Date.now()}`;
    localStorage.setItem('bst_user_lic', btoa(code));
  } else {
    localStorage.removeItem('bst_user_lic');
  }
};

export const getDeletedTxIds = (): string[] => {
  const data = localStorage.getItem('bst_deleted_tx_ids');
  return data ? JSON.parse(data) : [];
};

export const saveDeletedTxIds = (ids: string[]): void => {
  localStorage.setItem('bst_deleted_tx_ids', JSON.stringify(ids));
};
