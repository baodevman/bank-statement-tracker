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

  // Auto-detect Shinhan Bank (uses dedicated dynamic parser)
  if (fullText.includes('shinhan')) {
    return {
      bank: 'Shinhan Bank',
      mapping: {
        dateCol: 0,
        descCol: 1,
        amountCol: 2
      },
      templateId: 'predefined_shinhan_bank'
    };
  }

  // Auto-detect BVBank / BVB (Bản Việt)
  if (fullText.includes('bvbank') || fullText.includes('bvb') || fullText.includes('bản việt') || fullText.includes('viet capital')) {
    return {
      bank: 'BVBank (Bản Việt)',
      mapping: {
        dateCol: 0,
        descCol: 1,
        amountCol: 2
      },
      templateId: 'predefined_bvbank'
    };
  }

  // Auto-detect OCB / Liobank
  if (fullText.includes('ocb') || fullText.includes('liobank') || fullText.includes('phương đông')) {
    return {
      bank: fullText.includes('liobank') ? 'Liobank (OCB)' : 'OCB Bank',
      mapping: {
        dateCol: 0,
        descCol: 1,
        amountCol: 2
      },
      templateId: 'predefined_ocb_bank'
    };
  }

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
    let currentSection: 'header' | 'purchase' | 'installment' | 'other' = 'header';
    
    // Explicit metadata keywords to ignore top of statement / summary info (Statement Date, Payment Due Date, Credit Limit, etc.)
    const metadataKeywords = [
      'ngày lập sao kê', 'statement date',
      'ngày đến hạn', 'due date', 'payment due date',
      'hạn mức tín dụng', 'credit limit',
      'dư nợ kỳ trước', 'previous balance',
      'dư nợ cuối kỳ', 'closing balance', 'new balance',
      'tổng số tiền thanh toán', 'total amount due',
      'thanh toán tối thiểu', 'minimum payment due',
      'số tài khoản', 'account number', 'số thẻ', 'card number',
      'họ và tên', 'customer name', 'tên khách hàng',
      'địa chỉ', 'address',
      'điểm thưởng', 'reward points', 'cashback', 'lũy kế', 'phát sinh trong kỳ'
    ];

    rawRows.forEach((row) => {
      const rowStr = row.cells.join(' ').toLowerCase();
      
      // Update section state based on headings or table column headers
      if (rowStr.includes('mua hàng') || rowStr.includes('purchase & cash') || rowStr.includes('cash advance') ||
          rowStr.includes('chi tiết giao dịch') || rowStr.includes('transaction summary') || rowStr.includes('transaction details') ||
          rowStr.includes('giao dịch trong kỳ') || rowStr.includes('ngày giao dịch') || rowStr.includes('transaction date')) {
        if (!rowStr.includes('trả góp') && !rowStr.includes('installment')) {
          currentSection = 'purchase';
        }
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

      // Ignore metadata rows (Statement Date, Payment Due Date, Credit Limit, Customer Info, etc.)
      if (metadataKeywords.some(kw => rowStr.includes(kw))) {
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
      
      // Skip if we are still in top statement header section
      if (currentSection === 'header') return;
      
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
        
        // Check for refund / reversal / cancellation
        const textForRefund = (description + ' ' + textForCardCheck).toLowerCase();
        const isRefundTx = textForRefund.includes('hoàn tiền') || textForRefund.includes('hủy giao dịch') ||
          textForRefund.includes('hoàn') || textForRefund.includes('refund') ||
          textForRefund.includes('reversal') || textForRefund.includes('cancel') ||
          textForRefund.includes('void') || textForRefund.includes('return') ||
          row.cells[amountCellIdx]?.includes('CR') || (row.cells[amountCellIdx]?.startsWith('-') && !textForRefund.includes('mua hàng'));

        if (isRefundTx) {
          amount = Math.abs(amount); // Positive credit/refund amount
        } else {
          // Spending is always negative (expense)
          amount = -Math.abs(amount);
        }

        transactions.push({
          id: `${statementId}_shinhan_purchase_${row.index}_${amount}`,
          date: transactionDate,
          description: description.replace(/\s+/g, ' ').trim(),
          amount,
          originalAmount: amount,
          category: isRefundTx ? 'income' : 'others',
          groupId: null,
          excludeFromPersonal: false,
          isSplit: false,
          statementId,
          bank: bankName,
          cardType: itemCardType,
          isRefund: isRefundTx,
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
        
        amount = -Math.abs(amount);

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

  // Custom Parser for BVBank / Bản Việt
  if (bankName.toLowerCase().includes('bvbank') || bankName.toLowerCase().includes('bản việt') || bankName.toLowerCase().includes('bvb') || bankName.toLowerCase().includes('viet capital')) {
    let inTransactionSection = false;

    const metadataKeywords = [
      'dư nợ kỳ trước', 'previous balance',
      'dư nợ cuối kỳ', 'closing balance', 'new balance',
      'tổng số tiền thanh toán', 'total amount due',
      'thanh toán tối thiểu', 'minimum payment due',
      'hạn mức tín dụng', 'credit limit',
      'ngày đến hạn', 'payment due date',
      'ngày lập sao kê', 'statement date',
      'tổng cộng phát sinh', 'tổng số tiền phát sinh',
      'dư nợ đầu kỳ', 'bảng tổng hợp', 'tổng kết'
    ];

    rawRows.forEach((row) => {
      const rowText = row.cells.join(' ').toLowerCase();

      // Check if we reached the main transaction details table header
      if (
        rowText.includes('chi tiết giao dịch') ||
        rowText.includes('nội dung giao dịch') ||
        rowText.includes('diễn giải') ||
        (rowText.includes('ngày giao dịch') && rowText.includes('ngày bút toán')) ||
        rowText.includes('transaction details')
      ) {
        // Skip header line itself, enable parsing
        inTransactionSection = true;
        return;
      }

      // Skip summary / metadata header section if main transaction header hasn't been passed yet
      if (!inTransactionSection) {
        return;
      }

      // Skip summary metadata rows at bottom or between sections
      if (metadataKeywords.some(kw => rowText.includes(kw))) {
        return;
      }

      // Skip header repetitions or card number lines
      const isHeaderRow = row.cells.some(cell => {
        const c = cell.toLowerCase();
        return c.includes('ngày giao dịch') || c.includes('ngày bút toán') || c.includes('chi tiết') || c.includes('số tiền') || c.includes('số dư');
      });
      if (isHeaderRow) return;

      // Need at least 2 cells
      if (row.cells.length < 2) return;

      // Find Date Cell
      let transactionDate = '';
      let dateCellIdx = -1;
      for (let i = 0; i < row.cells.length; i++) {
        const d = formatDate(row.cells[i]);
        if (d && row.cells[i].trim().length <= 25) {
          transactionDate = d;
          dateCellIdx = i;
          break;
        }
      }

      if (!transactionDate || dateCellIdx === -1) return;

      // Find description and amounts dynamically
      let description = '';
      const numCells: { idx: number; val: number; raw: string }[] = [];

      for (let i = dateCellIdx + 1; i < row.cells.length; i++) {
        const cellRaw = row.cells[i].trim();
        if (!cellRaw) continue;

        // Skip post date if cell is another date
        const d = formatDate(cellRaw);
        if (d) continue;

        const amountVal = parseAmount(cellRaw);
        const isNumeric = !isNaN(Number(cellRaw.replace(/[.,\sđVNDvnd$]/g, '')));

        if (isNumeric && amountVal !== 0) {
          numCells.push({ idx: i, val: amountVal, raw: cellRaw });
        } else if (!description && (!isNumeric || (cellRaw.length > 3 && !cellRaw.includes('.')))) {
          // Keep text as description (if it's not just "0" or a row index)
          if (cellRaw !== '0' && cellRaw !== '1' && cellRaw !== '2') {
            description = cellRaw;
          }
        }
      }

      if (!description || description === '0') return;

      let amount = 0;
      if (numCells.length === 1) {
        amount = numCells[0].val;
      } else if (numCells.length >= 2) {
        const first = numCells[0].val;
        const second = numCells[1].val;
        if (first !== 0) {
          amount = -Math.abs(first);
        } else if (second !== 0) {
          amount = Math.abs(second);
        }
      }

      if (amount === 0 && numCells.length > 0) {
        amount = numCells[0].val;
      }

      if (amount === 0) return;

      // Refund check
      const descLower = description.toLowerCase();
      const isRefundTx = descLower.includes('hoàn tiền') || descLower.includes('hủy giao dịch') ||
        descLower.includes('hoàn') || descLower.includes('refund') ||
        descLower.includes('reversal') || rowText.includes('cr');

      if (isRefundTx) {
        amount = Math.abs(amount);
      } else if (numCells.length === 1 && !rowText.includes('cr') && amount > 0) {
        amount = -Math.abs(amount);
      }

      transactions.push({
        id: `${statementId}_bvbank_${row.index}_${amount}`,
        date: transactionDate,
        description: description.replace(/\s+/g, ' ').trim(),
        amount,
        originalAmount: amount,
        category: (amount > 0 || isRefundTx) ? 'income' : 'others',
        groupId: null,
        excludeFromPersonal: false,
        isSplit: false,
        statementId,
        bank: bankName,
        cardType: cardType,
        isRefund: isRefundTx || amount > 0,
      });
    });

    transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    console.log("BVBank Dynamic Parsed Transactions:", transactions);
    return transactions;
  }

  // Custom Parser for Liobank / OCB
  if (bankName.toLowerCase().includes('liobank') || bankName.toLowerCase().includes('ocb') || bankName.toLowerCase().includes('phương đông')) {
    const metadataKeywords = [
      'sao kê tài khoản', 'account statement',
      'tổng tiền vào', 'total credit',
      'tổng tiền ra', 'total debit',
      'số dư đầu kỳ', 'opening balance',
      'số dư cuối kỳ', 'closing balance',
      'hạn mức tín dụng', 'credit limit',
      'ngày lập sao kê', 'statement date'
    ];

    rawRows.forEach((row) => {
      const rowText = row.cells.join(' ').toLowerCase();

      // Skip metadata summary rows
      if (metadataKeywords.some(kw => rowText.includes(kw))) {
        return;
      }

      // Skip header rows
      const isHeaderRow = row.cells.some(cell => {
        const c = cell.toLowerCase();
        return c.includes('ngày giao dịch') || c.includes('ngày bút toán') ||
          c.includes('nội dung') || c.includes('chi tiết') ||
          c.includes('ghi nợ') || c.includes('ghi có') ||
          c.includes('tiền vào') || c.includes('tiền ra') ||
          c.includes('số tiền') || c.includes('số dư');
      });
      if (isHeaderRow) return;

      if (row.cells.length < 2) return;

      // Find Date Cell
      let transactionDate = '';
      let dateCellIdx = -1;
      for (let i = 0; i < row.cells.length; i++) {
        const d = formatDate(row.cells[i]);
        if (d && row.cells[i].trim().length <= 25) {
          transactionDate = d;
          dateCellIdx = i;
          break;
        }
      }

      if (!transactionDate || dateCellIdx === -1) return;

      // Find description and Debit/Credit amounts
      let description = '';
      const numericCells: { idx: number; val: number; raw: string }[] = [];

      for (let i = dateCellIdx + 1; i < row.cells.length; i++) {
        const cellRaw = row.cells[i].trim();
        if (!cellRaw) continue;

        const d = formatDate(cellRaw);
        if (d) continue;

        const amountVal = parseAmount(cellRaw);
        const isNumeric = !isNaN(Number(cellRaw.replace(/[.,\sđVNDvnd$]/g, '')));

        if (isNumeric && cellRaw !== '0') {
          numericCells.push({ idx: i, val: amountVal, raw: cellRaw });
        } else if (!description && !isNumeric) {
          description = cellRaw;
        }
      }

      if (!description) return;

      let amount = 0;
      if (numericCells.length === 1) {
        const raw = numericCells[0].raw;
        if (raw.startsWith('-') || rowText.includes('ghi nợ') || rowText.includes('tiền ra')) {
          amount = -Math.abs(numericCells[0].val);
        } else {
          if (rowText.includes('ghi có') || rowText.includes('tiền vào') || rowText.includes('cr')) {
            amount = Math.abs(numericCells[0].val);
          } else {
            amount = -Math.abs(numericCells[0].val);
          }
        }
      } else if (numericCells.length >= 2) {
        const firstVal = Math.abs(numericCells[0].val);
        const secondVal = Math.abs(numericCells[1].val);

        if (firstVal > 0 && (numericCells.length === 2 || secondVal === 0 || numericCells[0].idx < numericCells[1].idx)) {
          if (numericCells.length === 2) {
            if (rowText.includes('ghi có') || rowText.includes('tiền vào')) {
              amount = firstVal;
            } else {
              amount = -firstVal;
            }
          } else {
            amount = -firstVal;
          }
        } else if (secondVal > 0) {
          amount = secondVal;
        }
      }

      if (amount === 0) return;

      const descLower = description.toLowerCase();
      const isRefundTx = descLower.includes('hoàn tiền') || descLower.includes('hủy giao dịch') ||
        descLower.includes('hoàn') || descLower.includes('refund') ||
        descLower.includes('reversal') || rowText.includes('cr') || amount > 0;

      transactions.push({
        id: `${statementId}_liobank_${row.index}_${amount}`,
        date: transactionDate,
        description: description.replace(/\s+/g, ' ').trim(),
        amount: isRefundTx ? Math.abs(amount) : -Math.abs(amount),
        originalAmount: isRefundTx ? Math.abs(amount) : -Math.abs(amount),
        category: (amount > 0 || isRefundTx) ? 'income' : 'others',
        groupId: null,
        excludeFromPersonal: false,
        isSplit: false,
        statementId,
        bank: bankName,
        cardType: cardType,
        isRefund: isRefundTx || amount > 0,
      });
    });

    transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    console.log("Liobank/OCB Dynamic Parsed Transactions:", transactions);
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
    
    // Check for refund / reversal / cancellation
    const descLower = description.toLowerCase();
    const isRefundTx = descLower.includes('hoàn tiền') || descLower.includes('hủy giao dịch') ||
      descLower.includes('hoàn') || descLower.includes('refund') ||
      descLower.includes('reversal') || descLower.includes('cancel') ||
      descLower.includes('void') || descLower.includes('return') ||
      rowText.includes('cr') || amount > 0;

    if (isRefundTx) {
      amount = Math.abs(amount);
    }

    // Detect per-transaction card type if description contains specific keywords
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
      category: (amount > 0 || isRefundTx) ? 'income' : 'others', // defaults
      groupId: null,
      excludeFromPersonal: false,
      isSplit: false,
      statementId,
      bank: bankName,
      cardType: itemCardType,
      isRefund: isRefundTx || amount > 0,
    });
  });
  
  // Sort transactions by date ascending
  transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  return transactions;
}
