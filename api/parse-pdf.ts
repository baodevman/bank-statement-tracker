import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

interface RawRow {
  index: number;
  cells: string[];
}

interface TempItem {
  str: string;
  x: number;
  y: number;
  width: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { fileBase64, password } = req.body || {};

  try {
    if (!fileBase64) {
      return res.status(400).json({ error: 'Missing fileBase64 data' });
    }

    const buffer = Buffer.from(fileBase64, 'base64');
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      password: password || '',
      useWorkerFetch: false,
      isEvalSupported: false,
    });

    const pdfDoc = await loadingTask.promise;
    const rawRows: RawRow[] = [];
    let rowIndexCounter = 0;

    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();

      const items: TempItem[] = textContent.items
        .map((item: any) => ({
          str: item.str,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width || (item.str.length * 6),
        }))
        .filter(item => item.str.trim() !== '');

      if (items.length === 0) continue;

      const rowGroups: { y: number; items: TempItem[] }[] = [];

      items.forEach(item => {
        const foundGroup = rowGroups.find(g => Math.abs(g.y - item.y) < 10);
        if (foundGroup) {
          foundGroup.items.push(item);
        } else {
          rowGroups.push({ y: item.y, items: [item] });
        }
      });

      rowGroups.sort((a, b) => b.y - a.y);

      rowGroups.forEach(group => {
        group.items.sort((a, b) => a.x - b.x);

        const cells: string[] = [];
        let currentCell = '';
        let lastRight = -999;

        group.items.forEach(item => {
          if (lastRight === -999) {
            currentCell = item.str;
            lastRight = item.x + item.width;
          } else if (item.x - lastRight < 6) {
            currentCell += ' ' + item.str;
            lastRight = Math.max(lastRight, item.x + item.width);
          } else {
            cells.push(currentCell.trim());
            currentCell = item.str;
            lastRight = item.x + item.width;
          }
        });

        if (currentCell) {
          cells.push(currentCell.trim());
        }

        if (cells.length > 0) {
          rawRows.push({
            index: rowIndexCounter++,
            cells,
          });
        }
      });
    }

    return res.status(200).json({ rawRows });
  } catch (error: any) {
    console.error('Server PDF parse error:', error);
    const msg = error.message || '';
    if (error.name === 'PasswordException' || msg.toLowerCase().includes('password')) {
      return res.status(401).json({ error: password ? 'INCORRECT_PASSWORD' : 'PASSWORD_REQUIRED' });
    }
    return res.status(500).json({ error: 'Failed to parse PDF: ' + msg });
  }
}
