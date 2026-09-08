import {
  getLocalBankMappings,
  saveLocalBankMappings,
  getAppSettings,
  saveAppSettings,
  type BankMappingTemplate
} from './db';

const getAuthHeaderAsync = async (): Promise<Record<string, string>> => {
  const settings = getAppSettings();
  const googleToken = settings.googleAccessToken;
  if (!googleToken) return {};

  const now = new Date();
  if (settings.firebaseIdToken && settings.firebaseIdTokenExpiry) {
    const expiry = new Date(settings.firebaseIdTokenExpiry);
    if (expiry.getTime() > now.getTime()) {
      return { 'Authorization': `Bearer ${settings.firebaseIdToken}` };
    }
  }

  try {
    const apiKey = import.meta.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return { 'Authorization': `Bearer ${googleToken}` };
    }

    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        postBody: `access_token=${encodeURIComponent(googleToken)}&providerId=google.com`,
        requestUri: window.location.origin,
        returnSecureToken: true
      })
    });

    if (!res.ok) {
      throw new Error('Failed to exchange Google token for Firebase ID token');
    }

    const data = await res.json();
    const idToken = data.idToken;

    settings.firebaseIdToken = idToken;
    settings.firebaseIdTokenExpiry = new Date(now.getTime() + 50 * 60 * 1000).toISOString();
    saveAppSettings(settings);

    return { 'Authorization': `Bearer ${idToken}` };
  } catch (e) {
    console.error('Error exchanging Google token for Firebase token, falling back to Google Access Token:', e);
    return { 'Authorization': `Bearer ${googleToken}` };
  }
};

export interface AppUser {
  email: string;
  isPremium: boolean;
  isDisabled: boolean;
  dailyUploadLimit: number;
  uploadsToday: number;
  lastUploadDate: string;
  updatedAt: string;
  customBanks?: string[];
}

const getBaseUrl = () => {
  const projectId = import.meta.env.FIREBASE_PROJECT_ID || '';
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
};

const parseFirestoreFields = (fields: any) => {
  const res: any = {};
  if (!fields) return res;
  for (const key in fields) {
    const valObj = fields[key];
    if ('stringValue' in valObj) res[key] = valObj.stringValue;
    else if ('integerValue' in valObj) res[key] = parseInt(valObj.integerValue, 10);
    else if ('doubleValue' in valObj) res[key] = parseFloat(valObj.doubleValue);
    else if ('booleanValue' in valObj) res[key] = valObj.booleanValue;
    else if ('arrayValue' in valObj) {
      const values = valObj.arrayValue.values || [];
      res[key] = values.map((v: any) => v.stringValue || '');
    }
  }
  return res;
};

const toFirestoreFields = (obj: any) => {
  const fields: any = {};
  for (const key in obj) {
    const val = obj[key];
    if (typeof val === 'string') {
      fields[key] = { stringValue: val };
    } else if (typeof val === 'number') {
      if (Number.isInteger(val)) {
        fields[key] = { integerValue: val.toString() };
      } else {
        fields[key] = { doubleValue: val };
      }
    } else if (typeof val === 'boolean') {
      fields[key] = { booleanValue: val };
    } else if (Array.isArray(val)) {
      fields[key] = {
        arrayValue: {
          values: val.map(v => ({ stringValue: String(v) }))
        }
      };
    }
  }
  return fields;
};

// --- Templates API ---

export const fetchTemplates = async (): Promise<BankMappingTemplate[]> => {
  try {
    const res = await fetch('/api/templates');
    if (!res.ok) throw new Error('Failed to fetch templates from backend');
    const list = await res.json();

    saveLocalBankMappings(list);
    localStorage.setItem('bst_templates_cache_time', Date.now().toString());
    return list;
  } catch (e) {
    console.error('Backend fetch templates error:', e);
    return getLocalBankMappings();
  }
};

export const fetchTemplatesWithCache = async (force = false): Promise<BankMappingTemplate[]> => {
  const cacheTime = localStorage.getItem('bst_templates_cache_time');
  const now = Date.now();
  const isCacheFresh = cacheTime && (now - parseInt(cacheTime, 10)) < 24 * 60 * 60 * 1000;
  if (isCacheFresh && !force) {
    return getLocalBankMappings();
  }
  return fetchTemplates();
};

export const saveTemplateDoc = async (template: BankMappingTemplate): Promise<void> => {
  const local = getLocalBankMappings();
  const idx = local.findIndex(m => m.id === template.id);
  if (idx >= 0) local[idx] = template;
  else local.push(template);
  saveLocalBankMappings(local);

  try {
    const res = await fetch('/api/templates', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await getAuthHeaderAsync())
      },
      body: JSON.stringify(template)
    });
    if (!res.ok) throw new Error('Failed to save template to backend');
  } catch (e) {
    console.error('Backend save template error:', e);
  }
};

export const deleteTemplateDoc = async (templateId: string): Promise<void> => {
  const local = getLocalBankMappings();
  const filtered = local.filter(m => m.id !== templateId);
  saveLocalBankMappings(filtered);

  try {
    const res = await fetch(`/api/templates?id=${templateId}`, {
      method: 'DELETE',
      headers: await getAuthHeaderAsync()
    });
    if (!res.ok) throw new Error('Failed to delete template from backend');
  } catch (e) {
    console.error('Backend delete template error:', e);
  }
};

// --- Users API ---

export const fetchUserDoc = async (email: string): Promise<AppUser | null> => {
  const projectId = import.meta.env.FIREBASE_PROJECT_ID;
  if (!projectId) return null;

  try {
    const res = await fetch(`${getBaseUrl()}/users/${email}`, {
      headers: await getAuthHeaderAsync()
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('Failed to fetch user');
    const data = await res.json();
    return parseFirestoreFields(data.fields) as AppUser;
  } catch (e) {
    console.error('Firestore fetch user error:', e);
    return null;
  }
};

export const saveUserDoc = async (user: AppUser): Promise<void> => {
  const projectId = import.meta.env.FIREBASE_PROJECT_ID;
  if (!projectId) return;

  try {
    const body = { fields: toFirestoreFields(user) };
    const res = await fetch(`${getBaseUrl()}/users/${user.email}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(await getAuthHeaderAsync())
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('Failed to save user info to Firestore');
  } catch (e) {
    console.error('Firestore save user error:', e);
  }
};

export const fetchAllUsers = async (): Promise<AppUser[]> => {
  const projectId = import.meta.env.FIREBASE_PROJECT_ID;
  if (!projectId) return [];

  try {
    const res = await fetch(`${getBaseUrl()}/users?pageSize=1000`, {
      headers: await getAuthHeaderAsync()
    });
    if (!res.ok) throw new Error('Failed to fetch users list');
    const data = await res.json();
    if (!data.documents) return [];
    return data.documents.map((doc: any) => parseFirestoreFields(doc.fields) as AppUser);
  } catch (e) {
    console.error('Firestore fetch all users error:', e);
    return [];
  }
};

// --- Banks Directory API ---

export const saveGlobalBank = async (bankName: string): Promise<void> => {
  const projectId = import.meta.env.FIREBASE_PROJECT_ID;
  if (!projectId) return;

  const bankId = bankName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  try {
    const body = {
      fields: {
        name: { stringValue: bankName },
        updatedAt: { stringValue: new Date().toISOString() }
      }
    };
    const res = await fetch(`${getBaseUrl()}/banks/${bankId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(await getAuthHeaderAsync())
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('Failed to save bank to global list');
  } catch (e) {
    console.error('Firestore save global bank error:', e);
  }
};

export const fetchGlobalBanks = async (): Promise<string[]> => {
  const projectId = import.meta.env.FIREBASE_PROJECT_ID;
  if (!projectId) return [];

  try {
    const res = await fetch(`${getBaseUrl()}/banks?pageSize=1000`);
    if (!res.ok) throw new Error('Failed to fetch global banks');
    const data = await res.json();
    if (!data.documents) return [];
    return data.documents.map((doc: any) => {
      const fields = parseFirestoreFields(doc.fields);
      return fields.name || '';
    }).filter((name: string) => name !== '');
  } catch (e) {
    console.error('Firestore fetch global banks error:', e);
    return [];
  }
};
