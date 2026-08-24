import * as pdfjsLib from 'pdfjs-dist';
import type { Transaction, BankMappingTemplate } from './db';

// Set worker Src to local bundled asset via Vite to ensure offline-capability and avoid cross-origin / CDN blocks
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export interface RawRow {
  index: number;
  cells: string[];
}

export interface ColumnMapping {
  dateCol: number;
  descCol: number;
  amountCol: number; // For single amount column (could be negative/positive)
  debitCol?: number; // If separate debit/credit
  creditCol?: number; // If separate debit/credit
  balanceCol?: number;
}

// Check if a string looks like a date (DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DD/MM/YY)
const DATE_REGEX = /\b(0?[1-9]|[12]\d|3[01])[\/\-.](0?[1-9]|1[012])[\/\-.](\d{2,4})\b|\b\d{4}[\/\-.](0?[1-9]|1[012])[\/\-.](0?[1-9]|[12]\d|3[01])\b/;

// Clean and parse amount string
export function parseAmount(str: string): number {
  if (!str) return 0;
  
  // Remove currency units (VND, $, etc.), spaces
  let cleaned = str.replace(/[VNDvndđ$,\s]/g, '');
  
  // If Vietnamese layout: amount is usually formatted as 1.000.000,00 or 500.000
  // If English layout: 1,000,000.00 or 500,000
  // Let's analyze dot and comma occurrences:
  const dotCount = (cleaned.match(/\./g) || []).length;
  const commaCount = (cleaned.match(/,/g) || []).length;
  
  if (dotCount > 0 && commaCount === 1) {
    // Looks like 1.234.567,89 (Vietnamese format)
    cleaned = cleaned.replace(/\./g, '').replace(/,/g, '.');
  } else if (commaCount > 0 && dotCount === 1) {
    // Looks like 1,234,567.89 (English format)
    cleaned = cleaned.replace(/,/g, '');
  } else if (dotCount > 1) {
    // Looks like 1.234.567 (Vietnamese format without decimals)
    cleaned = cleaned.replace(/\./g, '');
  } else if (commaCount > 1) {
    // Looks like 1,234,567 (English format without decimals)
    cleaned = cleaned.replace(/,/g, '');
  } else if (dotCount === 1 && commaCount === 0) {
    // Single separator, could be decimal or thousands.
    // If it's near the end and length is small, e.g. .00 or .50, treat as decimal.
    // In VN statements, 500.000 is 500k, not 500.
    const parts = cleaned.split('.');
    if (parts[1] && parts[1].length === 2) {
      // Decimal
    } else {
      // Thousands separator
      cleaned = cleaned.replace(/\./g, '');
    }
  } else if (commaCount === 1 && dotCount === 0) {
    const parts = cleaned.split(',');
    if (parts[1] && parts[1].length === 2) {
      // Decimal (comma as decimal, e.g. 500000,50)
      cleaned = cleaned.replace(/,/g, '.');
    } else {
      // Thousands separator
      cleaned = cleaned.replace(/,/g, '');
    }
  }

  // Parse to float
  let val = parseFloat(cleaned);
  if (isNaN(val)) return 0;
  
  // Handle trailing/leading signs (+/-)
  if (str.includes('-') || str.includes('CR') === false && str.includes('DR') === true) {
    if (val > 0) val = -val;
  }
  
  return val;
}

// Convert DD/MM/YYYY or similar to YYYY-MM-DD
export function formatDate(str: string): string {
  const match = str.match(DATE_REGEX);
  if (!match) return '';
  
  const raw = match[0];
  const parts = raw.split(/[\/\-.]/);
  
  if (parts.length === 3) {
    // If YYYY-MM-DD
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
    // If DD/MM/YYYY or DD/MM/YY
    let day = parts[0];
    let month = parts[1];
    let year = parts[2];
    if (year.length === 2) {
      year = '20' + year; // assume 20xx
    }
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  return '';
}

// Read raw text layout from PDF
export async function extractPDFRawRows(
  pdfData: ArrayBuffer,
  password?: string
): Promise<RawRow[]> {
  try {
    const loadingTask = pdfjsLib.getDocument({
      data: pdfData.slice(0), // Clone the buffer to prevent it from being detached by the Web Worker
      password: password,
    });
    
    const pdfDoc = await loadingTask.promise;
    const rawRows: RawRow[] = [];
    let rowIndexCounter = 0;
    
    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      interface TempItem {
        str: string;
        x: number;
        y: number;
        width: number;
      }
      
      const items: TempItem[] = textContent.items
        .map((item: any) => ({
          str: item.str,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width || (item.str.length * 6), // estimation if missing
        }))
        .filter(item => item.str.trim() !== '');
        
      if (items.length === 0) continue;
      
      // Group items by Y coordinate (rows)
      // Group rows if Y differs by less than 10px to accommodate slightly offset headers/multi-line fields
      const rowGroups: { y: number; items: TempItem[] }[] = [];
      
      items.forEach(item => {
        let foundGroup = rowGroups.find(g => Math.abs(g.y - item.y) < 10);
        if (foundGroup) {
          foundGroup.items.push(item);
        } else {
          rowGroups.push({ y: item.y, items: [item] });
        }
      });
      
      // Sort rows by Y descending
      rowGroups.sort((a, b) => b.y - a.y);
      
      rowGroups.forEach(group => {
        // Sort items inside row left-to-right (X ascending)
        group.items.sort((a, b) => a.x - b.x);
        
        // Merge items that are horizontally very close (e.g. gap less than 6px) to avoid column merging
        const cells: string[] = [];
        let currentCell = '';
        let lastRight = -999;
        
        group.items.forEach(item => {
          if (lastRight === -999) {
            currentCell = item.str;
            lastRight = item.x + item.width;
          } else if (item.x - lastRight < 6) {
            // Merge cells
            currentCell += ' ' + item.str;
            lastRight = Math.max(lastRight, item.x + item.width);
          } else {
            // Start new cell
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
    
    return rawRows;
  } catch (error: any) {
    if (error.name === 'PasswordException' || error.code === 1 || error.code === 2 || error.message?.toLowerCase().includes('password')) {
      throw new Error(password ? 'INCORRECT_PASSWORD' : 'PASSWORD_REQUIRED');
    }
    throw error;
  }
}

// Match a raw row array against a template's column mapping keywords
export function detectTemplateAndMapping(
  rawRows: RawRow[],
  templates: BankMappingTemplate[]
): { bank: string; mapping: ColumnMapping | null; templateId: string | null } {
  const fullText = rawRows.slice(0, 100)
    .map(r => r.cells.join(' '))
    .join('\n')
    .normalize('NFC')
    .toLowerCase();

  console.log("DEBUG: detectTemplateAndMapping fullText excerpt:", fullText.slice(0, 1000));

  for (const template of templates) {
    const detectKws = template.detectKeywords || [template.bankName];
    const matchesBank = detectKws.some(kw => fullText.includes(kw.toLowerCase()));
    if (!matchesBank) continue;

    // Default keywords if template has undefined fields
    const dateKws = template.dateKeywords || ['ngày', 'date'];
    const descKws = template.descKeywords || ['nội dung', 'merchant', 'description'];
    const amountKws = template.amountKeywords || ['số tiền', 'amount', 'phát sinh'];
    const debitKws = template.debitKeywords || ['ghi nợ', 'debit'];
    const creditKws = template.creditKeywords || ['ghi có', 'credit'];

    const maxIdx = Math.max(
      template.dateColIndex,
      template.descColIndex,
      template.amountColIndex,
      template.debitColIndex ?? -1,
      template.creditColIndex ?? -1
    );

    let hasHeaderMatch = false;

    for (const row of rawRows.slice(0, 50)) {
      if (row.cells.length <= maxIdx) continue;
      const cellsLower = row.cells.map(c => c.toLowerCase().trim());

      const cellDate = cellsLower[template.dateColIndex] || '';
      const dateMatch = dateKws.some(kw => cellDate.includes(kw.toLowerCase()));
      if (!dateMatch) continue;

      const cellDesc = cellsLower[template.descColIndex] || '';
      const descMatch = descKws.some(kw => cellDesc.includes(kw.toLowerCase()));
      if (!descMatch) continue;

      let amountMatch = false;
      if (template.debitColIndex !== undefined && template.debitColIndex !== -1 &&
          template.creditColIndex !== undefined && template.creditColIndex !== -1) {
        const cellDebit = cellsLower[template.debitColIndex] || '';
        const cellCredit = cellsLower[template.creditColIndex] || '';
        const debitMatch = debitKws.some(kw => cellDebit.includes(kw.toLowerCase()));
        const creditMatch = creditKws.some(kw => cellCredit.includes(kw.toLowerCase()));
        if (debitMatch && creditMatch) {
          amountMatch = true;
        }
      } else if (template.amountColIndex !== undefined && template.amountColIndex !== -1) {
        const cellAmount = cellsLower[template.amountColIndex] || '';
        amountMatch = amountKws.some(kw => cellAmount.includes(kw.toLowerCase()));
      }

      if (amountMatch) {
        hasHeaderMatch = true;
        break;
      }
    }

    if (hasHeaderMatch && checkTemplateCompatibility(rawRows, template)) {
      return {
        bank: template.bankName,
        mapping: {
          dateCol: template.dateColIndex,
          descCol: template.descColIndex,
          amountCol: template.amountColIndex,
          debitCol: template.debitColIndex,
          creditCol: template.creditColIndex
        },
        templateId: template.id
      };
    }
  }

  return { bank: 'Generic', mapping: null, templateId: null };
}

// Check template compatibility against raw rows
export function checkTemplateCompatibility(
  rawRows: RawRow[],
  template: {
    dateColIndex: number;
    descColIndex: number;
    amountColIndex: number;
    debitColIndex?: number;
    creditColIndex?: number;
  }
): boolean {
  let matchedCount = 0;
  const maxIdx = Math.max(
    template.dateColIndex,
    template.descColIndex,
    template.amountColIndex,
    template.debitColIndex ?? -1,
    template.creditColIndex ?? -1
  );

  for (const row of rawRows.slice(0, 100)) {
    if (row.cells.length <= maxIdx) continue;

    const rawDate = (row.cells[template.dateColIndex] || '').trim();
    if (rawDate.length > 25) continue;
    const formattedDate = formatDate(rawDate);
    if (!formattedDate) continue;

    // Check description
    const desc = (row.cells[template.descColIndex] || '').trim();
    if (!desc) continue;

    // Check amount/debit/credit
    let validAmount = false;
    if (template.debitColIndex !== undefined && template.debitColIndex !== -1 && 
        template.creditColIndex !== undefined && template.creditColIndex !== -1) {
      const debitVal = parseAmount(row.cells[template.debitColIndex]);
      const creditVal = parseAmount(row.cells[template.creditColIndex]);
      if (debitVal !== 0 || creditVal !== 0) {
        validAmount = true;
      }
    } else if (template.amountColIndex !== undefined && template.amountColIndex !== -1) {
      const amountVal = parseAmount(row.cells[template.amountColIndex]);
      if (amountVal !== 0) {
        validAmount = true;
      }
    }

    if (validAmount) {
      matchedCount++;
      if (matchedCount >= 2) {
        return true; 
      }
    }
  }

  return matchedCount >= 1;
}

// Convert Raw Rows into Transactions using a Mapping
export function parseTransactionsFromRaw(
  rawRows: RawRow[],
  mapping: ColumnMapping,
  bankName: string,
  statementId: string
): Transaction[] {
  const transactions: Transaction[] = [];
  
  // Detect default card type from statement full text
  let cardType: string | null = null;
  const fullText = rawRows.slice(0, 100).map(r => r.cells.join(' ')).join('\n').toLowerCase();
  if (fullText.includes('visa')) {
    cardType = 'VISA';
  } else if (fullText.includes('mastercard') || fullText.includes('master card') || fullText.includes('master')) {
    cardType = 'MASTER';
  } else if (fullText.includes('jcb')) {
    cardType = 'JCB';
  }
  
  // Custom Parser for Shinhan Bank statements
  if (bankName.toLowerCase().includes('shinhan')) {
    let currentSection: 'purchase' | 'installment' | 'other' = 'purchase';
    
    rawRows.forEach((row) => {
      const rowStr = row.cells.join(' ').toLowerCase();
      
      // Update section state based on headings
      if (rowStr.includes('mua hàng') || rowStr.includes('purchase & cash') || rowStr.includes('cash advance') ||
          rowStr.includes('chi tiết giao dịch') || rowStr.includes('transaction summary') || rowStr.includes('transaction details')) {
        currentSection = 'purchase';
        return;
      }
      if (rowStr.includes('trả góp') || rowStr.includes('installment')) {
        currentSection = 'installment';
        return;
      }
      if (rowStr.includes('tiền mặt linh hoạt') || rowStr.includes('flexi-cash')) {
        currentSection = 'other';
        return;
      }
      if (rowStr.includes('phí / fees') || rowStr.includes('phí / fee')) {
        currentSection = 'other';
        return;
      }
      if (rowStr.includes('lãi / interest')) {
        currentSection = 'other';
        return;
      }
      if (rowStr.includes('thanh toán / payments') || rowStr.includes('thanh toán trong kỳ')) {
        currentSection = 'other';
        return;
      }
      
      // Ignore header rows and card numbers
      const isCardHeader = row.cells.some(cell => 
        /\b\d{4}-\d{2}XX-XXXX-\d{4}\b/i.test(cell) || 
        cell.includes('XX-XXXX') || 
        cell.toLowerCase().includes('primary') ||
        cell.toLowerCase().includes('ngày giao dịch') ||
        cell.toLowerCase().includes('transaction date') ||
        cell.toLowerCase().includes('ngày bút toán') ||
        cell.toLowerCase().includes('post date')
      );
      if (isCardHeader) return;
      
      // We need at least Date and Amount
      if (row.cells.length < 2) return;
      
      // Find Date Cell dynamically
      let transactionDate = '';
      let dateCellIdx = -1;
      for (let i = 0; i < row.cells.length; i++) {
        const d = formatDate(row.cells[i]);
        if (d) {
          transactionDate = d;
          dateCellIdx = i;
          break;
        }
      }
      
      if (!transactionDate || dateCellIdx === -1) return; // Not a transaction row
      

      
      // Find final Amount Cell: the last non-zero number in the row
      let amount = 0;
      let amountCellIdx = -1;
      for (let i = row.cells.length - 1; i > dateCellIdx; i--) {
        const val = parseAmount(row.cells[i]);
        if (val !== 0) {
          amount = val;
          amountCellIdx = i;
          break;
        }
      }
      
      if (amount === 0 || amountCellIdx === -1) return;
      
      // Spending is always negative (expense)
      amount = -Math.abs(amount);
      
      // Card brand check
      let itemCardType = cardType;
      const textForCardCheck = row.cells.join(' ').toLowerCase();
      if (textForCardCheck.includes('visa')) itemCardType = 'VISA';
      else if (textForCardCheck.includes('mastercard') || textForCardCheck.includes('master')) itemCardType = 'MASTER';
      else if (textForCardCheck.includes('jcb')) itemCardType = 'JCB';
      
      if (currentSection === 'purchase') {
        // Adaptively find the merchant name, handling potential cell merging (e.g. "03-07-2026 Google One")
        let description = '';
        const cellAfterDate = row.cells[dateCellIdx + 1] || '';
        const d2 = formatDate(cellAfterDate);
        
        if (d2) {
          // Cell after date contains post date, check if it also contains merchant name (merged cell)
          const stripped = cellAfterDate.replace(DATE_REGEX, '').replace(/\s+/g, ' ').trim();
          if (stripped) {
            description = stripped;
          } else {
            // It was a clean date, merchant name is in the next cell
            description = (row.cells[dateCellIdx + 2] || '').trim();
          }
        } else {
          // No post date in the second cell, so this is the merchant name directly
          description = cellAfterDate.trim();
        }
        
        if (!description) return;
        
        transactions.push({
          id: `${statementId}_shinhan_purchase_${row.index}_${amount}`,
          date: transactionDate,
          description: description.replace(/\s+/g, ' ').trim(),
          amount,
          originalAmount: amount,
          category: 'others',
          groupId: null,
          excludeFromPersonal: false,
          isSplit: false,
          statementId,
          bank: bankName,
          cardType: itemCardType,
        });
      } else if (currentSection === 'installment') {
        // Adaptively find the merchant name, handling potential cell merging (e.g. "28-04-2026 Shopee")
        let description = '';
        const cellWithDate = row.cells[dateCellIdx] || '';
        const stripped = cellWithDate.replace(DATE_REGEX, '').replace(/\s+/g, ' ').trim();
        
        if (stripped) {
          description = stripped;
        } else {
          // If the date cell was clean, the merchant is in the next cell
          description = (row.cells[dateCellIdx + 1] || '').trim();
        }
        
        if (!description) return;
        
        // Remaining Principal is typically at index 3 in standard 7-cell installment row
        // If date and merchant were merged, the array length is 6, so index 2 is Remaining Principal!
        const remainingIdx = stripped ? dateCellIdx + 2 : dateCellIdx + 3;
        let remainingBalance = 0;
        if (row.cells.length > remainingIdx) {
          remainingBalance = parseAmount(row.cells[remainingIdx]);
        }
        
        transactions.push({
          id: `${statementId}_shinhan_installment_${row.index}_${amount}`,
          date: transactionDate,
          description: `[Trả góp] ${description}`.replace(/\s+/g, ' ').trim(),
          amount,
          originalAmount: amount,
          category: 'others',
          groupId: null,
          excludeFromPersonal: false,
          isSplit: false,
          statementId,
          bank: bankName,
          cardType: itemCardType,
          isInstallment: true,
          remainingBalance: Math.abs(remainingBalance),
        });
      }
    });
    
    // Sort transactions by date ascending
    transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    console.log("Shinhan Dynamic Parsed Transactions:", transactions);
    return transactions;
  }
  
  // Standard Parser for other banks
  rawRows.forEach((row) => {
    // Verify column lengths
    const maxIndex = Math.max(
      mapping.dateCol,
      mapping.descCol,
      mapping.amountCol,
      mapping.debitCol ?? -1,
      mapping.creditCol ?? -1,
      mapping.balanceCol ?? -1
    );
    
    if (row.cells.length <= maxIndex) return;
    
    const rawDate = (row.cells[mapping.dateCol] || '').trim();
    
    // Skip rows where the date cell is too long (e.g. metadata lines like "Period: 01-07-2026")
    if (rawDate.length > 25) return;
    
    const formattedDate = formatDate(rawDate);
    if (!formattedDate) return;

    // Filter out rows containing metadata/header keywords to skip table titles and statement headers
    const rowText = row.cells.join(' ').toLowerCase();
    const metadataKeywords = [
      'period', 'account number', 'customer name', 'customer address', 
      'card number', 'credit limit', 'balance at the beginning', 
      'balance at the end', 'total income', 'total expenditure',
      'ngày giao dịch', 'nội dung', 'số tiền', 'số dư', 'tổng cộng',
      'date', 'description', 'credit amount', 'debit amount', 'balance'
    ];
    if (metadataKeywords.some(kw => rowText.includes(kw))) {
      return; 
    }
    
    // Extract description
    const description = row.cells[mapping.descCol] || '';
    
    // Extract amount
    let amount = 0;
    
    if (mapping.debitCol !== undefined && mapping.debitCol !== -1 && 
        mapping.creditCol !== undefined && mapping.creditCol !== -1) {
      const debitStr = row.cells[mapping.debitCol];
      const creditStr = row.cells[mapping.creditCol];
      
      const debitVal = parseAmount(debitStr);
      const creditVal = parseAmount(creditStr);
      
      if (debitVal !== 0) {
        amount = -Math.abs(debitVal);
      } else if (creditVal !== 0) {
        amount = Math.abs(creditVal); // Credit transactions are deposits/refunds (positive)
      }
    } else {
      const amountStr = row.cells[mapping.amountCol];
      amount = -Math.abs(parseAmount(amountStr)); // Force negative (expense) for single amount columns
    }
    
    // Skip transaction rows where amount is 0 (likely header or sub-header lines that matched date regex)
    if (amount === 0) return;
    
    // Detect per-transaction card type if description contains specific keywords
    const descLower = description.toLowerCase();
    let itemCardType = cardType;
    if (descLower.includes('visa')) {
      itemCardType = 'VISA';
    } else if (descLower.includes('mastercard') || descLower.includes('master card') || descLower.includes('master')) {
      itemCardType = 'MASTER';
    } else if (descLower.includes('jcb')) {
      itemCardType = 'JCB';
    }
    
    transactions.push({
      id: `${statementId}_${row.index}_${amount}`,
      date: formattedDate,
      description: description.replace(/\s+/g, ' ').trim(),
      amount,
      originalAmount: amount,
      category: amount > 0 ? 'income' : 'others', // defaults
      groupId: null,
      excludeFromPersonal: false,
      isSplit: false,
      statementId,
      bank: bankName,
      cardType: itemCardType,
    });
  });
  
  // Sort transactions by date ascending
  transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  return transactions;
}
