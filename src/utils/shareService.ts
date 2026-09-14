import type { Transaction } from './db';

export interface SharePayload {
  version: number;
  title: string;
  createdAt: number;
  expiresAt: number; // Timestamp in ms
  hasPassword: boolean;
  tableGroups: {
    groupId: string | null;
    groupName: string;
    transactions: Transaction[];
  }[];
}

// Generate encryption key from password using PBKDF2
async function getKeyFromPassword(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Encrypt payload string with password
export async function encryptPayload(dataStr: string, password?: string): Promise<string> {
  if (!password) {
    // Unencrypted: encode as UTF-8 Base64
    const bytes = new TextEncoder().encode(dataStr);
    let binStr = '';
    bytes.forEach(b => { binStr += String.fromCharCode(b); });
    return btoa(binStr);
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getKeyFromPassword(password, salt);

  const encodedData = new TextEncoder().encode(dataStr);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encodedData
  );

  // Pack salt (16 bytes) + iv (12 bytes) + ciphertext into Uint8Array
  const packed = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
  packed.set(salt, 0);
  packed.set(iv, salt.length);
  packed.set(new Uint8Array(ciphertext), salt.length + iv.length);

  let binStr = '';
  packed.forEach(b => { binStr += String.fromCharCode(b); });
  return 'ENC:' + btoa(binStr);
}

// Decrypt payload string with password
export async function decryptPayload(encryptedStr: string, password?: string): Promise<string> {
  if (!encryptedStr.startsWith('ENC:')) {
    // Unencrypted Base64
    const binStr = atob(encryptedStr);
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) {
      bytes[i] = binStr.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  }

  if (!password) {
    throw new Error('PASSWORD_REQUIRED');
  }

  const base64Data = encryptedStr.substring(4);
  const binStr = atob(base64Data);
  const packed = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) {
    packed[i] = binStr.charCodeAt(i);
  }

  const salt = packed.slice(0, 16);
  const iv = packed.slice(16, 28);
  const ciphertext = packed.slice(28);

  const key = await getKeyFromPassword(password, salt);

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    throw new Error('INCORRECT_PASSWORD');
  }
}

// Create Share Link (Tự động gửi Firestore hoặc tạo Self-Contained Encrypted URL Hash)
export async function createShareLink(
  payload: SharePayload,
  password?: string
): Promise<{ shareUrl: string; shareId: string }> {
  const jsonStr = JSON.stringify(payload);
  const encrypted = await encryptPayload(jsonStr, password);

  const shareId = `share_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // Attempt to save to Vercel Firestore API
  let savedToCloud = false;
  try {
    const res = await fetch('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: shareId,
        encryptedPayload: encrypted,
        expiresAt: payload.expiresAt,
        hasPassword: payload.hasPassword,
      }),
    });
    if (res.ok) {
      savedToCloud = true;
    }
  } catch (e) {
    console.warn('Vercel API /api/share unavailable, falling back to encrypted hash payload:', e);
  }

  const baseUrl = `${window.location.origin}${window.location.pathname}`;

  if (savedToCloud) {
    return {
      shareUrl: `${baseUrl}?share=${shareId}`,
      shareId,
    };
  }

  // Fallback: Encode directly into URL hash fragment (100% fail-proof on Vercel)
  const hashUrl = `${baseUrl}#shareData=${shareId}:${encodeURIComponent(encrypted)}`;
  return {
    shareUrl: hashUrl,
    shareId,
  };
}

// Fetch and unpack share data from Cloud API or Hash fragment
export async function fetchShareData(
  shareIdOrHash: string
): Promise<{ encryptedPayload: string; expiresAt?: number }> {
  // Case 1: From Hash URL
  if (window.location.hash.includes('shareData=')) {
    const hashContent = window.location.hash.split('shareData=')[1];
    const firstColonIdx = hashContent.indexOf(':');
    if (firstColonIdx > 0) {
      const encrypted = decodeURIComponent(hashContent.substring(firstColonIdx + 1));
      return { encryptedPayload: encrypted };
    }
  }

  // Case 2: From Vercel Firestore API
  const res = await fetch(`/api/share?id=${encodeURIComponent(shareIdOrHash)}`);
  if (!res.ok) {
    if (res.status === 410 || res.status === 404) {
      throw new Error('EXPIRED_OR_NOT_FOUND');
    }
    throw new Error('FAILED_TO_FETCH_SHARE');
  }

  const data = await res.json();
  if (data.expiresAt && Date.now() > data.expiresAt) {
    throw new Error('EXPIRED_OR_NOT_FOUND');
  }

  return {
    encryptedPayload: data.encryptedPayload,
    expiresAt: data.expiresAt,
  };
}
