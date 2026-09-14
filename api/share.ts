import type { VercelRequest, VercelResponse } from '@vercel/node';

// Firestore helpers for Vercel Serverless Function
const parseFirestoreFields = (fields: any) => {
  const res: any = {};
  if (!fields) return res;
  for (const key in fields) {
    const valObj = fields[key];
    if ('stringValue' in valObj) res[key] = valObj.stringValue;
    else if ('integerValue' in valObj) res[key] = parseInt(valObj.integerValue, 10);
    else if ('doubleValue' in valObj) res[key] = parseFloat(valObj.doubleValue);
    else if ('booleanValue' in valObj) res[key] = valObj.booleanValue;
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
    }
  }
  return fields;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const projectId = process.env.BST_FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    return res.status(500).json({ error: 'Missing BST_FIREBASE_PROJECT_ID configuration' });
  }

  const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

  if (req.method === 'GET') {
    try {
      const shareId = req.query.id as string;
      if (!shareId) {
        return res.status(400).json({ error: 'Missing share ID' });
      }

      const fetchRes = await fetch(`${baseUrl}/shared_reports/${shareId}`);
      if (!fetchRes.ok) {
        return res.status(404).json({ error: 'Share link not found or expired' });
      }

      const data = await fetchRes.json();
      const fields = parseFirestoreFields(data.fields);

      if (fields.expiresAt && Date.now() > fields.expiresAt) {
        // Asynchronously delete expired share document from Firestore
        fetch(`${baseUrl}/shared_reports/${shareId}`, { method: 'DELETE' }).catch(() => {});
        return res.status(410).json({ error: 'Share link has expired' });
      }

      return res.status(200).json(fields);
    } catch (error: any) {
      console.error('Failed to get share report:', error);
      return res.status(500).json({ error: 'Failed to fetch share report: ' + error.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const { id, encryptedPayload, expiresAt, hasPassword } = req.body || {};
      if (!id || !encryptedPayload) {
        return res.status(400).json({ error: 'Invalid share payload' });
      }

      const body = {
        fields: toFirestoreFields({
          id,
          encryptedPayload,
          expiresAt: expiresAt || 0,
          hasPassword: !!hasPassword,
          createdAt: Date.now(),
        })
      };

      const patchRes = await fetch(`${baseUrl}/shared_reports/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!patchRes.ok) {
        const errText = await patchRes.text();
        throw new Error(`Firestore patch error: ${patchRes.status} - ${errText}`);
      }

      return res.status(200).json({ success: true, id });
    } catch (error: any) {
      console.error('Failed to save share report:', error);
      return res.status(500).json({ error: 'Failed to save share report: ' + error.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
