import type { VercelRequest, VercelResponse } from '@vercel/node';

// Firestore helpers (to clean up client-side)
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    return res.status(500).json({ error: 'Missing FIREBASE_PROJECT_ID configuration' });
  }

  const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

  if (req.method === 'GET') {
    try {
      const fetchRes = await fetch(`${baseUrl}/bank_templates?pageSize=300`);
      if (!fetchRes.ok) {
        throw new Error(`Firestore returned status ${fetchRes.status}`);
      }
      const data = await fetchRes.json();
      if (!data.documents) {
        return res.status(200).json([]);
      }

      const templates = data.documents.map((doc: any) => {
        const fields = parseFirestoreFields(doc.fields);
        const id = doc.name.split('/').pop() || '';
        return { id, ...fields };
      });

      return res.status(200).json(templates);
    } catch (error: any) {
      console.error('Failed to get templates:', error);
      return res.status(500).json({ error: 'Failed to fetch templates: ' + error.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const template = req.body;
      if (!template || !template.id || !template.bankName) {
        return res.status(400).json({ error: 'Invalid template data' });
      }

      // Proxy client's Authorization header to Firestore if present
      const authHeader = req.headers.authorization;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (authHeader) {
        headers['Authorization'] = authHeader;
      }

      const body = { fields: toFirestoreFields(template) };
      const patchRes = await fetch(`${baseUrl}/bank_templates/${template.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body)
      });

      if (!patchRes.ok) {
        const errText = await patchRes.text();
        throw new Error(`Firestore patch error: ${patchRes.status} - ${errText}`);
      }

      return res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('Failed to save template:', error);
      return res.status(500).json({ error: 'Failed to save template: ' + error.message });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const templateId = req.query.id as string;
      if (!templateId) {
        return res.status(400).json({ error: 'Missing template ID' });
      }

      const authHeader = req.headers.authorization;
      const headers: Record<string, string> = {};
      if (authHeader) {
        headers['Authorization'] = authHeader;
      }

      const delRes = await fetch(`${baseUrl}/bank_templates/${templateId}`, {
        method: 'DELETE',
        headers
      });

      if (!delRes.ok) {
        const errText = await delRes.text();
        throw new Error(`Firestore delete error: ${delRes.status} - ${errText}`);
      }

      return res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('Failed to delete template:', error);
      return res.status(500).json({ error: 'Failed to delete template: ' + error.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
