import React, { useState, useMemo } from 'react';
import html2canvas from 'html2canvas';
import { Search, Filter, Edit2, Group, CheckSquare, Square, Split, Trash2, Sparkles, Printer, Share2 } from 'lucide-react';
import type { Transaction, Category, Group as TxGroup } from '../utils/db';

interface TransactionTableProps {
  transactions: Transaction[];
  categories: Category[];
  groups: TxGroup[];
  selectedStatement: string;
  setSelectedStatement: (val: string) => void;
  statementPeriods: { key: string, label: string }[];
  archivedPeriods: string[];
  onUpdateTransactions: (updated: Transaction[]) => void;
  onDeleteTransactions: (ids: string[]) => void;
  onCreateGroup: (name: string, txIds: string[]) => void;
  onAddRule: (keyword: string, categoryId: string) => void;
  isRebuilding?: boolean;
}

export const TransactionTable: React.FC<TransactionTableProps> = ({
  transactions,
  categories,
  groups,
  selectedStatement,
  setSelectedStatement,
  statementPeriods,
  archivedPeriods,
  onUpdateTransactions,
  onDeleteTransactions,
  onCreateGroup,
  onAddRule: _onAddRule,
  isRebuilding = false,
}) => {
  // Filter by statement
  const statementFiltered = useMemo(() => {
    return transactions;
  }, [transactions]);

  // Helper to remove accents for smart search
  const removeAccents = (str: string): string => {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D');
  };

  // Helper to format date display to DD-MM-YYYY
  const formatDateDisplay = (dateStr: string): string => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return dateStr;
  };

  // Search & Filters State
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('all');
  const [showFilterModal, setShowFilterModal] = useState<boolean>(false);

  const handleResetFilters = () => {
    setSelectedCategory('all');
    setSelectedGroupFilter('all');
    setSelectedStatement('all');
    setSearchTerm('');
  };

  // Selection State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Column Visibility State
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('bst_visible_columns');
      if (saved) return JSON.parse(saved);
    } catch (e) { }
    return {
      bank: true,
      cardType: true,
      classification: true,
      actions: true
    };
  });

  const handleToggleColumn = (col: string) => {
    setVisibleColumns(prev => {
      const updated = { ...prev, [col]: !prev[col] };
      localStorage.setItem('bst_visible_columns', JSON.stringify(updated));
      return updated;
    });
  };

  // Column Sorting State
  const [sortField, setSortField] = useState<'date' | 'bank' | 'description' | 'category' | 'amount' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (field: 'date' | 'bank' | 'description' | 'category' | 'amount') => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Inline Row Edit State
  const [inlineEditingId, setInlineEditingId] = useState<string | null>(null);
  const [inlineDate, setInlineDate] = useState<string>('');
  const [inlineDesc, setInlineDesc] = useState<string>('');
  const [inlineAmount, setInlineAmount] = useState<number>(0);
  const [inlineCategory, setInlineCategory] = useState<string>('');
  const [inlineGroupId, setInlineGroupId] = useState<string>('');
  const [inlineCardType, setInlineCardType] = useState<string>('');
  const [inlineExclude, setInlineExclude] = useState<boolean>(false);

  const handleStartInlineEdit = (tx: Transaction) => {
    setInlineEditingId(tx.id);
    setInlineDate(tx.date);
    setInlineDesc(tx.description);
    setInlineAmount(tx.amount);
    setInlineCategory(tx.category || '');
    setInlineGroupId(tx.groupId || 'none');
    setInlineCardType(tx.cardType || 'none');
    setInlineExclude(tx.excludeFromPersonal);
  };

  const handleSaveInlineEdit = (tx: Transaction) => {
    const updated: Transaction = {
      ...tx,
      date: inlineDate,
      description: inlineDesc,
      amount: inlineAmount,
      category: inlineCategory,
      groupId: inlineGroupId === 'none' ? null : inlineGroupId,
      excludeFromPersonal: inlineExclude || inlineGroupId !== 'none',
      cardType: inlineCardType === 'none' ? null : inlineCardType
    };
    onUpdateTransactions([updated]);
    setInlineEditingId(null);
  };

  // Split Modal State
  const [splittingTx, setSplittingTx] = useState<Transaction | null>(null);
  const [splitAmount1, setSplitAmount1] = useState<number>(0);
  const [splitAmount2, setSplitAmount2] = useState<number>(0);
  const [splitDesc1, setSplitDesc1] = useState<string>('');
  const [splitDesc2, setSplitDesc2] = useState<string>('');
  const [splitGroup2, setSplitGroup2] = useState<string>('');
  const [splitExclude2, setSplitExclude2] = useState<boolean>(true);

  // Group Create State
  const [showGroupCreate, setShowGroupCreate] = useState<boolean>(false);
  const [newGroupName, setNewGroupName] = useState<string>('');

  // Bulk actions floating states
  const [bulkCategory, setBulkCategory] = useState<string>('');
  const [bulkGroup, setBulkGroup] = useState<string>('');

  // Smart Scan & Bulk Categorize States
  const [scanTx, setScanTx] = useState<Transaction | null>(null);
  const [scanKeyword, setScanKeyword] = useState<string>('');
  const [scanCategory, setScanCategory] = useState<string>('');
  const [selectedScanTxIds, setSelectedScanTxIds] = useState<string[]>([]);

  // Helper to extract clean keywords from descriptors
  const extractCleanKeyword = (desc: string): string => {
    let clean = desc.normalize('NFC').trim();
    // Split by first occurrence of -, *, :, or comma
    const parts = clean.split(/[-*:,]/);
    let mainPart = parts[0].trim();

    // Remove transaction generic prefixes
    const prefixLower = mainPart.toLowerCase();
    const genericPrefixes = ['op', 'payoo', 'gd', 'ft', 'ib', 'mb', 'chuyen khoan', 'ck', 'transfer', 'nap tien'];
    if (genericPrefixes.includes(prefixLower) && parts.length > 1) {
      mainPart = parts[1].trim();
    }

    // Clean dates and times
    mainPart = mainPart.replace(/\d{2}[/\-]\d{2}(?:[/\-]\d{4})?/g, '');
    mainPart = mainPart.replace(/\d{2}:\d{2}(?::\d{2})?/g, '');
    mainPart = mainPart.trim();

    // Take the first 2 words if it is still very long
    const words = mainPart.split(/\s+/);
    if (words.length > 3) {
      return words.slice(0, 2).join(' ');
    }
    return mainPart;
  };

  // Apply filters with accent-insensitive search
  const processedTransactions = useMemo(() => {
    const cleanSearch = removeAccents(searchTerm.toLowerCase().trim());
    return statementFiltered.filter(t => {
      const matchesSearch = removeAccents(t.description.toLowerCase()).includes(cleanSearch);
      const matchesCategory = selectedCategory === 'all' ? true : t.category === selectedCategory;
      const matchesGroup = selectedGroupFilter === 'all' ? true :
        selectedGroupFilter === 'none' ? t.groupId === null : t.groupId === selectedGroupFilter;

      return matchesSearch && matchesCategory && matchesGroup;
    });
  }, [statementFiltered, searchTerm, selectedCategory, selectedGroupFilter]);

  // Sort the filtered transactions
  const sortedTransactions = useMemo(() => {
    const list = [...processedTransactions];
    if (!sortField) return list;

    list.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (sortField === 'amount') {
        valA = a.amount;
        valB = b.amount;
      } else if (sortField === 'category') {
        const catA = categories.find(c => c.id === a.category)?.name || '';
        const catB = categories.find(c => c.id === b.category)?.name || '';
        valA = removeAccents(catA.toLowerCase());
        valB = removeAccents(catB.toLowerCase());
      } else if (sortField === 'bank' || sortField === 'description' || sortField === 'date') {
        valA = removeAccents((valA || '').toLowerCase());
        valB = removeAccents((valB || '').toLowerCase());
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [processedTransactions, sortField, sortDirection, categories]);

  // Export and Share Helpers
  const handleExportPDF = () => {
    window.print();
  };

  const handleShareReport = async (elementId: string, summaryText: string) => {
    const element = document.getElementById(elementId);
    if (!element) return;

    try {
      const canvas = await html2canvas(element, { useCORS: true, scale: 2 });
      canvas.toBlob(async (blob: Blob | null) => {
        if (!blob) {
          throw new Error('Failed to generate image blob');
        }

        const imageFile = new File([blob], 'report.png', { type: 'image/png' });

        if (navigator.canShare && navigator.canShare({ files: [imageFile] })) {
          await navigator.share({
            files: [imageFile],
            title: 'Báo cáo chi tiêu',
            text: summaryText
          });
        } else {
          if (navigator.share) {
            await navigator.share({
              title: 'Báo cáo chi tiêu',
              text: summaryText
            });
          } else {
            await navigator.clipboard.writeText(summaryText);

            // Auto download file as fallback
            const link = document.createElement('a');
            link.download = 'report.png';
            link.href = canvas.toDataURL('image/png');
            link.click();

            alert('Đã sao chép tóm tắt báo cáo vào Clipboard và tự động tải ảnh báo cáo về máy! Bạn có thể dán (Paste) để gửi tin nhắn Zalo hoặc chia sẻ file ảnh qua Bluetooth.');
          }
        }
      }, 'image/png');
    } catch (err) {
      console.error('Failed to share report:', err);
      await navigator.clipboard.writeText(summaryText);
      alert('Đã sao chép tóm tắt báo cáo vào Clipboard! Bạn có thể dán để chia sẻ qua Zalo hoặc Bluetooth.');
    }
  };

  const tableSummaryText = useMemo(() => {
    let totalPersonal = 0;
    let totalGroup = 0;

    sortedTransactions.forEach(t => {
      if (t.amount < 0) {
        const absVal = Math.abs(t.amount);
        if (t.groupId || t.excludeFromPersonal) {
          totalGroup += absVal;
        } else {
          totalPersonal += absVal;
        }
      }
    });

    return `📊 BÁO CÁO GIAO DỊCH BST
Số giao dịch: ${sortedTransactions.length}
- Tổng chi tiêu cá nhân: ${totalPersonal.toLocaleString('vi-VN')} VND
- Tổng chi tiêu nhóm/mua hộ: ${totalGroup.toLocaleString('vi-VN')} VND`;
  }, [sortedTransactions]);

  // Calculate totals per group in the currently filtered transactions (filtered group totals)
  const groupTotals = useMemo(() => {
    const totals: Record<string, number> = { personal: 0, personal_exclude: 0 };

    // Initialize groups
    groups.forEach(g => {
      totals[g.id] = 0;
    });

    processedTransactions.forEach(t => {
      if (t.amount < 0) {
        const absVal = Math.abs(t.amount);
        if (t.groupId) {
          totals[t.groupId] = (totals[t.groupId] || 0) + absVal;
        } else if (t.excludeFromPersonal) {
          totals['personal_exclude'] = (totals['personal_exclude'] || 0) + absVal;
        } else {
          totals['personal'] = (totals['personal'] || 0) + absVal;
        }
      }
    });

    return totals;
  }, [processedTransactions, groups]);

  // Scan and Bulk Categorization Handlers
  const handleOpenBulkScan = (tx: Transaction) => {
    setScanTx(tx);
    const cleanedKw = extractCleanKeyword(tx.description);
    setScanKeyword(cleanedKw);
    setScanCategory(tx.category || '');

    // Pre-select other matching transactions
    const kwLower = cleanedKw.toLowerCase().trim();
    if (kwLower) {
      const matches = transactions.filter(t =>
        t.id !== tx.id &&
        t.description.toLowerCase().includes(kwLower)
      );
      setSelectedScanTxIds(matches.map(m => m.id));
    } else {
      setSelectedScanTxIds([]);
    }
  };

  const handleOpenBulkScanFromSelection = () => {
    if (selectedIds.length !== 1) return;
    const targetTx = transactions.find(t => t.id === selectedIds[0]);
    if (targetTx) {
      handleOpenBulkScan(targetTx);
    }
  };

  const handleScanKeywordChange = (newKw: string) => {
    setScanKeyword(newKw);
    const kwLower = newKw.toLowerCase().trim();
    if (!kwLower) {
      setSelectedScanTxIds([]);
      return;
    }
    const matches = transactions.filter(t =>
      scanTx && t.id !== scanTx.id &&
      t.description.toLowerCase().includes(kwLower)
    );
    setSelectedScanTxIds(matches.map(m => m.id));
  };

  const handleApplyBulkScan = () => {
    if (!scanTx || !scanCategory) return;

    // Categorize original transaction as well if it's not already
    const idsToUpdate = new Set([...selectedScanTxIds, scanTx.id]);

    const updated = transactions.map(t => {
      if (idsToUpdate.has(t.id)) {
        return { ...t, category: scanCategory };
      }
      return t;
    });

    onUpdateTransactions(updated);

    // Reset and close modal
    setScanTx(null);
    setSelectedScanTxIds([]);
    setSelectedIds([]);
  };

  // List of matching transactions computed dynamically for preview in modal
  const matchingTxs = useMemo(() => {
    if (!scanTx || !scanKeyword.trim()) return [];
    const kw = scanKeyword.toLowerCase().trim();
    return transactions.filter(t =>
      t.id !== scanTx.id &&
      t.description.toLowerCase().includes(kw)
    );
  }, [transactions, scanTx, scanKeyword]);

  // Handle select all
  const handleSelectAll = () => {
    if (selectedIds.length === processedTransactions.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(processedTransactions.map(t => t.id));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };



  // Open Split Modal
  const handleOpenSplit = (tx: Transaction) => {
    setSplittingTx(tx);
    const half = Math.round(tx.amount / 2);
    setSplitAmount1(half);
    setSplitAmount2(tx.amount - half);
    setSplitDesc1(`${tx.description} (Phần cá nhân)`);
    setSplitDesc2(`${tx.description} (Mua hộ/Chia sẻ)`);
    setSplitGroup2('none');
    setSplitExclude2(true);
  };

  const handleSaveSplit = () => {
    if (!splittingTx) return;

    const totalSplit = splitAmount1 + splitAmount2;
    if (Math.abs(totalSplit - splittingTx.amount) > 0.01) {
      alert(`Tổng số tiền sau khi chia (${totalSplit.toLocaleString('vi-VN')} VND) phải bằng số tiền gốc (${splittingTx.amount.toLocaleString('vi-VN')} VND).`);
      return;
    }

    // Create 2 split transactions
    const tx1: Transaction = {
      ...splittingTx,
      id: `${splittingTx.id}_split_1`,
      amount: splitAmount1,
      originalAmount: splittingTx.originalAmount,
      description: splitDesc1,
      isSplit: true,
    };

    const tx2: Transaction = {
      ...splittingTx,
      id: `${splittingTx.id}_split_2`,
      amount: splitAmount2,
      originalAmount: splittingTx.originalAmount,
      description: splitDesc2,
      groupId: splitGroup2 === 'none' ? null : splitGroup2,
      excludeFromPersonal: splitExclude2,
      isSplit: true,
    };

    // Update state: delete old transaction, insert 2 new ones
    onDeleteTransactions([splittingTx.id]);
    onUpdateTransactions([tx1, tx2]);

    setSplittingTx(null);
  };

  // Bulk Actions
  const handleApplyBulkCategory = () => {
    if (!bulkCategory || selectedIds.length === 0) return;
    const updated = transactions.map(t =>
      selectedIds.includes(t.id) ? { ...t, category: bulkCategory } : t
    );
    onUpdateTransactions(updated);
    setSelectedIds([]);
    setBulkCategory('');
  };

  const handleApplyBulkGroup = () => {
    if (!bulkGroup || selectedIds.length === 0) return;
    const groupId = bulkGroup === 'none' ? null : bulkGroup;
    const updated = transactions.map(t =>
      selectedIds.includes(t.id) ? { ...t, groupId, excludeFromPersonal: groupId ? true : t.excludeFromPersonal } : t
    );
    onUpdateTransactions(updated);
    setSelectedIds([]);
    setBulkGroup('');
  };

  const handleBulkExclude = (exclude: boolean) => {
    if (selectedIds.length === 0) return;
    const updated = transactions.map(t =>
      selectedIds.includes(t.id) ? { ...t, excludeFromPersonal: exclude } : t
    );
    onUpdateTransactions(updated);
    setSelectedIds([]);
  };

  const handleCreateGroupFromSelected = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim() || selectedIds.length === 0) return;

    onCreateGroup(newGroupName.trim(), selectedIds);
    setNewGroupName('');
    setShowGroupCreate(false);
    setSelectedIds([]);
  };

  const handleDeleteSelected = () => {
    if (window.confirm(`Bạn có chắc chắn muốn xóa ${selectedIds.length} giao dịch đã chọn?`)) {
      onDeleteTransactions(selectedIds);
      setSelectedIds([]);
    }
  };
  const renderSortIcon = (field: 'date' | 'bank' | 'description' | 'category' | 'amount') => {
    if (sortField !== field) return <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', marginLeft: '0.2rem' }}>↕</span>;
    return sortDirection === 'asc' ?
      <span style={{ color: 'var(--color-primary)', fontSize: '0.75rem', marginLeft: '0.2rem' }}>▲</span> :
      <span style={{ color: 'var(--color-primary)', fontSize: '0.75rem', marginLeft: '0.2rem' }}>▼</span>;
  };

  const isAnyFilterActive = selectedCategory !== 'all' || selectedGroupFilter !== 'all' || selectedStatement !== 'all';
  const activeFilterCount = (selectedCategory !== 'all' ? 1 : 0) + (selectedGroupFilter !== 'all' ? 1 : 0) + (selectedStatement !== 'all' ? 1 : 0);

  return (
    <div id="table-capture-area" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} className="animate-fade-in">

      {/* Export & Share Header controls (hidden when printing) */}
      <div className="print-hide" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <h3 style={{ margin: 0 }}>Bảng Giao Dịch Chi Tiết</h3>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem', gap: '0.35rem' }} onClick={handleExportPDF}>
            <Printer size={14} /> In / Xuất PDF
          </button>
          <button className="btn btn-primary" style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem', gap: '0.35rem' }} onClick={() => handleShareReport('table-capture-area', tableSummaryText)}>
            <Share2 size={14} /> Chia sẻ (Zalo/Bluetooth)
          </button>
        </div>
      </div>

      {/* Filtering Header */}
      <div className="glass-card print-hide" style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        padding: '1rem'
      }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', width: '100%', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1', minWidth: '240px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-tertiary)' }} />
            <input
              type="text"
              placeholder="Tìm kiếm theo nội dung giao dịch..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '2.5rem', width: '100%' }}
            />
          </div>
          <button
            className={`btn ${isAnyFilterActive ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.55rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', height: '42px', cursor: 'pointer' }}
            onClick={() => setShowFilterModal(true)}
          >
            <Filter size={16} />
            <span>Bộ lọc</span>
            {activeFilterCount > 0 && (
              <span style={{
                backgroundColor: isAnyFilterActive ? '#ffffff' : 'var(--color-primary)',
                color: isAnyFilterActive ? 'var(--color-primary)' : '#ffffff',
                borderRadius: '50%',
                width: '18px',
                height: '18px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                fontWeight: 'bold',
                marginLeft: '0.25rem'
              }}>
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Selected Filter Tags */}
        {isAnyFilterActive && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', marginTop: '0.25rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Đang lọc:</span>
            {selectedStatement !== 'all' && (
              <span className="badge" style={{ backgroundColor: 'rgba(99, 102, 241, 0.1)', color: 'var(--color-primary)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.5rem', borderRadius: 'var(--border-radius-sm)', fontSize: '0.75rem' }}>
                Kỳ: {statementPeriods.find(p => p.key === selectedStatement)?.label || selectedStatement}
                <span style={{ cursor: 'pointer', fontWeight: 'bold', marginLeft: '0.25rem', fontSize: '0.9rem' }} onClick={() => setSelectedStatement('all')}>&times;</span>
              </span>
            )}
            {selectedCategory !== 'all' && (
              <span className="badge" style={{ backgroundColor: 'rgba(99, 102, 241, 0.1)', color: 'var(--color-primary)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.5rem', borderRadius: 'var(--border-radius-sm)', fontSize: '0.75rem' }}>
                D.Mục: {categories.find(c => c.id === selectedCategory)?.name || selectedCategory}
                <span style={{ cursor: 'pointer', fontWeight: 'bold', marginLeft: '0.25rem', fontSize: '0.9rem' }} onClick={() => setSelectedCategory('all')}>&times;</span>
              </span>
            )}
            {selectedGroupFilter !== 'all' && (
              <span className="badge" style={{ backgroundColor: 'rgba(99, 102, 241, 0.1)', color: 'var(--color-primary)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.5rem', borderRadius: 'var(--border-radius-sm)', fontSize: '0.75rem' }}>
                Nhóm: {selectedGroupFilter === 'none' ? 'Cá nhân' : groups.find(g => g.id === selectedGroupFilter)?.name || selectedGroupFilter}
                <span style={{ cursor: 'pointer', fontWeight: 'bold', marginLeft: '0.25rem', fontSize: '0.9rem' }} onClick={() => setSelectedGroupFilter('all')}>&times;</span>
              </span>
            )}
            <button className="btn btn-ghost" style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', color: 'var(--color-danger)', cursor: 'pointer' }} onClick={handleResetFilters}>
              Xóa tất cả
            </button>
          </div>
        )}
      </div>

        {/* Selected Rows Bulk Actions Bar */}
        {selectedIds.length > 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
            backgroundColor: 'var(--bg-secondary)',
            padding: '0.75rem 1rem',
            borderRadius: 'var(--border-radius-md)',
            border: '1px solid var(--border-color)',
            animation: 'fadeIn 0.2s ease'
          }}>
            <div style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--color-primary)' }}>
              Đã chọn {selectedIds.length} giao dịch:
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              {/* Category bulk */}
              <select
                value={bulkCategory}
                onChange={(e) => setBulkCategory(e.target.value)}
                style={{ width: 'auto', padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
              >
                <option value="">Gán danh mục...</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button className="btn btn-secondary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }} onClick={handleApplyBulkCategory} disabled={!bulkCategory}>Áp dụng</button>

              {/* Group bulk */}
              <select
                value={bulkGroup}
                onChange={(e) => setBulkGroup(e.target.value)}
                style={{ width: 'auto', padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
              >
                <option value="">Gán nhóm...</option>
                <option value="none">Cá nhân</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <button className="btn btn-secondary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }} onClick={handleApplyBulkGroup} disabled={!bulkGroup}>Áp dụng</button>

              <div style={{ height: '20px', width: '1px', backgroundColor: 'var(--border-color)' }}></div>

              <button className="btn btn-secondary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }} onClick={() => handleBulkExclude(true)}>Mua hộ/Loại trừ</button>
              <button className="btn btn-secondary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }} onClick={() => handleBulkExclude(false)}>Tính cá nhân</button>
              <button className="btn btn-secondary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', color: 'var(--color-primary)' }} onClick={() => setShowGroupCreate(true)}>Tạo Nhóm mới</button>

              {selectedIds.length === 1 && (
                <>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem', borderColor: 'var(--color-primary)' }}
                    onClick={handleOpenBulkScanFromSelection}
                    title="Tìm và gán nhanh danh mục cho các giao dịch tương đồng"
                  >
                    <Sparkles size={13} color="var(--color-primary)" /> Scan tương tự
                  </button>
                </>
              )}

              <button className="btn btn-danger" style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }} onClick={handleDeleteSelected}><Trash2 size={14} /></button>
            </div>
          </div>
        )}

      {/* Group Totals Summary Card */}
      {processedTransactions.length > 0 && (
        <div className="glass-card" style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', backdropFilter: 'none' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span>Tổng chi phí theo Nhóm trong bộ lọc:</span>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {/* Personal Card */}
            {groupTotals.personal > 0 && (
              <div style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--border-radius-sm)',
                padding: '0.5rem 0.75rem',
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <span style={{ color: 'var(--text-secondary)' }}>👤 Cá nhân:</span>
                <strong style={{ color: 'var(--color-danger)' }}>{groupTotals.personal.toLocaleString('vi-VN')} VND</strong>
              </div>
            )}

            {/* Ungrouped Excluded (Mua hộ tự do) */}
            {groupTotals.personal_exclude > 0 && (
              <div style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--border-radius-sm)',
                padding: '0.5rem 0.75rem',
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <span style={{ color: 'var(--text-secondary)' }}>📦 Mua hộ tự do:</span>
                <strong style={{ color: 'var(--color-warning)' }}>{groupTotals.personal_exclude.toLocaleString('vi-VN')} VND</strong>
              </div>
            )}

            {/* Custom Groups */}
            {groups.map(g => {
              const total = groupTotals[g.id] || 0;
              if (total === 0) return null;
              return (
                <div key={g.id} style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--border-radius-sm)',
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <span style={{ color: 'var(--text-secondary)' }}>👥 {g.name}:</span>
                  <strong style={{ color: 'var(--color-primary)' }}>{total.toLocaleString('vi-VN')} VND</strong>
                </div>
              );
            })}

            {/* If no expenses at all */}
            {groupTotals.personal === 0 && groupTotals.personal_exclude === 0 && groups.every(g => (groupTotals[g.id] || 0) === 0) && (
              <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>Không có phát sinh chi phí (-) nào trong bộ lọc này.</span>
            )}
          </div>
        </div>
      )}

      {/* Group Create Modal from selection */}
      {showGroupCreate && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Tạo nhóm giao dịch mới</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Nhóm {selectedIds.length} giao dịch đã chọn và đặt tên để tính tổng chi phí gom chung.
            </p>
            <form onSubmit={handleCreateGroupFromSelected} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <input
                type="text"
                placeholder="Ví dụ: Mua hộ Lan tháng 8, Team building..."
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                required
                autoFocus
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowGroupCreate(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary">Tạo nhóm & Gán</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Main Table */}
      <div className="table-container">
        {sortedTransactions.length > 0 ? (
          <table className="table-el">
            <thead>
              <tr>
                <th style={{ width: '40px', textAlign: 'center' }} className="print-hide">
                  <button
                    onClick={handleSelectAll}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignContent: 'center', color: 'var(--text-secondary)' }}
                  >
                    {selectedIds.length === sortedTransactions.length ? <CheckSquare size={18} /> : <Square size={18} />}
                  </button>
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('date')}>
                  Ngày {renderSortIcon('date')}
                </th>
                {visibleColumns.bank && (
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('bank')}>
                    Ngân hàng {renderSortIcon('bank')}
                  </th>
                )}
                {visibleColumns.cardType && <th>Loại thẻ</th>}
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('description')}>
                  Nội dung giao dịch {renderSortIcon('description')}
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('category')}>
                  Danh mục {renderSortIcon('category')}
                </th>
                <th>Nhóm</th>
                <th style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('amount')}>
                  Số tiền {renderSortIcon('amount')}
                </th>
                {visibleColumns.classification && <th>Phân loại</th>}
                {visibleColumns.actions && <th style={{ width: '80px', textAlign: 'center' }} className="print-hide">Thao tác</th>}
              </tr>
            </thead>
            <tbody>
              {isRebuilding ? (
                Array.from({ length: 6 }).map((_, idx) => (
                  <tr key={`skeleton-${idx}`} style={{ opacity: 0.85 }}>
                    <td style={{ textAlign: 'center' }} className="print-hide">
                      <div className="skeleton-line" style={{ width: '18px', height: '18px', margin: '0 auto' }}></div>
                    </td>
                    <td><div className="skeleton-line" style={{ width: '75px' }}></div></td>
                    {visibleColumns.bank && <td><div className="skeleton-line" style={{ width: '60px' }}></div></td>}
                    {visibleColumns.cardType && <td><div className="skeleton-line" style={{ width: '50px' }}></div></td>}
                    <td><div className="skeleton-line" style={{ width: idx % 2 === 0 ? '70%' : '55%' }}></div></td>
                    <td><div className="skeleton-line" style={{ width: '80px' }}></div></td>
                    <td><div className="skeleton-line" style={{ width: '60px' }}></div></td>
                    <td style={{ textAlign: 'right' }}><div className="skeleton-line" style={{ width: '75px', marginLeft: 'auto' }}></div></td>
                    {visibleColumns.classification && <td><div className="skeleton-line" style={{ width: '45px', margin: '0 auto' }}></div></td>}
                    {visibleColumns.actions && <td className="print-hide"><div className="skeleton-line" style={{ width: '50px', margin: '0 auto' }}></div></td>}
                  </tr>
                ))
              ) : (
                sortedTransactions.map((tx) => {
                  const isSelected = selectedIds.includes(tx.id);
                  const categoryObj = categories.find(c => c.id === tx.category);
                  const groupObj = groups.find(g => g.id === tx.groupId);

                  if (tx.id === inlineEditingId) {
                    return (
                      <tr key={tx.id} style={{ backgroundColor: 'rgba(99, 102, 241, 0.1)' }}>
                        <td style={{ textAlign: 'center' }} className="print-hide">
                          <button disabled style={{ background: 'none', border: 'none', padding: 0, opacity: 0.3 }}>
                            <Square size={18} />
                          </button>
                        </td>
                        <td>
                          <input
                            type="date"
                            className="input-inline"
                            value={inlineDate}
                            onChange={e => setInlineDate(e.target.value)}
                          />
                        </td>
                        {visibleColumns.bank && (
                          <td>
                            <input
                              type="text"
                              className="input-inline"
                              value={tx.bank}
                              disabled
                              style={{ opacity: 0.7 }}
                            />
                          </td>
                        )}
                        {visibleColumns.cardType && (
                          <td>
                            <select
                              className="select-inline"
                              value={inlineCardType}
                              onChange={e => setInlineCardType(e.target.value)}
                            >
                              <option value="none">Không có badge</option>
                              <option value="VISA">VISA</option>
                              <option value="MASTER">MASTER</option>
                              <option value="JCB">JCB</option>
                            </select>
                          </td>
                        )}
                        <td>
                          <input
                            type="text"
                            className="input-inline"
                            value={inlineDesc}
                            onChange={e => setInlineDesc(e.target.value)}
                          />
                        </td>
                        <td>
                          <select
                            className="select-inline"
                            value={inlineCategory}
                            onChange={e => setInlineCategory(e.target.value)}
                          >
                            <option value="">-- Chọn danh mục --</option>
                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </td>
                        <td>
                          <select
                            className="select-inline"
                            value={inlineGroupId}
                            onChange={e => setInlineGroupId(e.target.value)}
                          >
                            <option value="none">Cá nhân</option>
                            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                          </select>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <input
                            type="number"
                            className="input-inline"
                            value={inlineAmount}
                            onChange={e => setInlineAmount(parseFloat(e.target.value) || 0)}
                            style={{ textAlign: 'right', fontWeight: 'bold' }}
                          />
                        </td>
                        {visibleColumns.classification && (
                          <td>
                            <label className="switch" style={{ transform: 'scale(0.8)' }}>
                              <input
                                type="checkbox"
                                checked={inlineExclude || inlineGroupId !== 'none'}
                                onChange={e => setInlineExclude(e.target.checked)}
                                disabled={inlineGroupId !== 'none'}
                              />
                              <span className="slider"></span>
                            </label>
                          </td>
                        )}
                        {visibleColumns.actions && (
                          <td className="print-hide">
                            <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'center' }}>
                              <button
                                className="btn btn-ghost"
                                style={{ padding: '0.25rem', fontSize: '1rem', color: 'var(--color-success)', cursor: 'pointer' }}
                                onClick={() => handleSaveInlineEdit(tx)}
                                title="Lưu"
                              >
                                💾
                              </button>
                              <button
                                className="btn btn-ghost"
                                style={{ padding: '0.25rem', fontSize: '1rem', color: 'var(--color-danger)', cursor: 'pointer' }}
                                onClick={() => setInlineEditingId(null)}
                                title="Hủy"
                              >
                                ❌
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  }

                  return (
                    <tr key={tx.id} style={{ backgroundColor: isSelected ? 'rgba(99, 102, 241, 0.05)' : undefined }}>
                      <td style={{ textAlign: 'center' }} className="print-hide">
                        <button
                          onClick={() => handleToggleSelect(tx.id)}
                          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignContent: 'center', color: isSelected ? 'var(--color-primary)' : 'var(--text-tertiary)' }}
                        >
                          {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                        </button>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDateDisplay(tx.date)}</td>
                      {visibleColumns.bank && (
                        <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{tx.bank}</td>
                      )}
                      {visibleColumns.cardType && (
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {tx.cardType ? (
                            <span
                              className="badge"
                              style={{
                                backgroundColor: tx.cardType === 'VISA' ? 'rgba(59, 130, 246, 0.15)' :
                                  tx.cardType === 'MASTER' ? 'rgba(249, 115, 22, 0.15)' :
                                    'rgba(16, 185, 129, 0.15)',
                                color: tx.cardType === 'VISA' ? '#3b82f6' :
                                  tx.cardType === 'MASTER' ? '#f97316' :
                                    '#10b981',
                                fontWeight: 'bold'
                              }}
                            >
                              {tx.cardType}
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>-</span>
                          )}
                        </td>
                      )}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', alignItems: 'flex-start' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: '500' }}>{tx.description}</span>
                            {tx.isInstallment && (
                              <span
                                className="tooltip-container"
                                style={{
                                  fontSize: '0.7rem',
                                  backgroundColor: 'rgba(245, 158, 11, 0.12)',
                                  color: 'var(--color-warning)',
                                  fontWeight: 'bold',
                                  border: '1px solid rgba(245, 158, 11, 0.25)',
                                  padding: '0.05rem 0.3rem',
                                  borderRadius: '4px',
                                  cursor: 'help',
                                  display: 'inline-flex',
                                  alignItems: 'center'
                                }}
                              >
                                Trả góp
                                <span className="tooltip-text">
                                  Dư nợ gốc còn lại: {tx.remainingBalance?.toLocaleString('vi-VN')} VND
                                </span>
                              </span>
                            )}
                          </div>
                          {tx.isSplit && (
                            <span style={{ fontSize: '0.7rem', color: 'var(--color-primary)', fontWeight: 'bold' }}>
                              [Đã chia nhỏ từ GD gốc: {tx.originalAmount.toLocaleString('vi-VN')} VND]
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        {categoryObj && (
                          <span
                            className="badge"
                            style={{ backgroundColor: `${categoryObj.color}15`, color: categoryObj.color }}
                          >
                            {categoryObj.name}
                          </span>
                        )}
                      </td>
                      <td>
                        {groupObj ? (
                          <span className="badge badge-primary">
                            <Group size={10} style={{ marginRight: '0.2rem' }} />
                            {groupObj.name}
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>Cá nhân</span>
                        )}
                      </td>
                      <td style={{
                        textAlign: 'right',
                        fontWeight: '700',
                        color: tx.amount > 0 ? 'var(--color-success)' : 'var(--color-danger)',
                        whiteSpace: 'nowrap'
                      }}>
                        {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString('vi-VN')} VND
                      </td>
                      {visibleColumns.classification && (
                        <td>
                          {tx.excludeFromPersonal || tx.groupId ? (
                            <span className="badge badge-warning">Mua hộ / Nhóm</span>
                          ) : (
                            <span className="badge badge-success">Cá nhân</span>
                          )}
                        </td>
                      )}
                      {visibleColumns.actions && (
                        <td className="print-hide">
                          <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'center' }}>
                            <button
                              className="btn btn-ghost"
                              style={{ padding: '0.25rem', borderRadius: 'var(--border-radius-sm)', color: 'var(--text-secondary)' }}
                              onClick={() => handleStartInlineEdit(tx)}
                              title="Sửa thông tin"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              className="btn btn-ghost"
                              style={{ padding: '0.25rem', borderRadius: 'var(--border-radius-sm)', color: 'var(--text-secondary)' }}
                              onClick={() => handleOpenBulkScan(tx)}
                              title="Gán nhanh giao dịch tương tự (Scan)"
                            >
                              <Sparkles size={14} />
                            </button>
                            {tx.amount < 0 && !tx.isSplit && (
                              <button
                                className="btn btn-ghost"
                                style={{ padding: '0.25rem', borderRadius: 'var(--border-radius-sm)', color: 'var(--text-secondary)' }}
                                onClick={() => handleOpenSplit(tx)}
                                title="Tách giao dịch (Split)"
                              >
                                <Split size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                }))}
            </tbody>
          </table>
        ) : (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            Không tìm thấy giao dịch nào phù hợp với bộ lọc tìm kiếm.
          </div>
        )}
      </div>



      {/* Filter Modal */}
      {showFilterModal && (
        <div className="modal-overlay" style={{ zIndex: 1200 }}>
          <div className="modal-content animate-fade-in" style={{ maxWidth: '400px', width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Filter size={18} /> Bộ lọc giao dịch
              </h3>
              <button className="btn btn-ghost" onClick={() => setShowFilterModal(false)} style={{ padding: '0.25rem', fontSize: '1.25rem', cursor: 'pointer' }}>
                &times;
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Statement Filter */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontWeight: '600', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Kỳ sao kê</label>
                <select value={selectedStatement} onChange={(e) => setSelectedStatement(e.target.value)}>
                  <option value="all">Tất cả kỳ sao kê (Đang hoạt động)</option>
                  {statementPeriods.some(p => !archivedPeriods.includes(p.key)) && (
                    <optgroup label="Kỳ sao kê hoạt động">
                      {statementPeriods.filter(p => !archivedPeriods.includes(p.key)).map(p => (
                        <option key={p.key} value={p.key}>{p.label}</option>
                      ))}
                    </optgroup>
                  )}
                  {statementPeriods.some(p => archivedPeriods.includes(p.key)) && (
                    <optgroup label="Kho Lưu trữ (Archive)">
                      {statementPeriods.filter(p => archivedPeriods.includes(p.key)).map(p => (
                        <option key={p.key} value={p.key}>📁 {p.label} (Đã lưu trữ)</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {/* Category Filter */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontWeight: '600', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Danh mục</label>
                <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
                  <option value="all">Tất cả danh mục</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {/* Group Filter */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontWeight: '600', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Nhóm chi tiêu</label>
                <select value={selectedGroupFilter} onChange={(e) => setSelectedGroupFilter(e.target.value)}>
                  <option value="all">Tất cả các nhóm</option>
                  <option value="none">Cá nhân</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>

              {/* Column Settings Toggle inside Modal */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                <span style={{ fontWeight: '600', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Hiển thị cột:</span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', cursor: 'pointer', color: 'var(--text-primary)' }}>
                    <input type="checkbox" checked={visibleColumns.bank} onChange={() => handleToggleColumn('bank')} style={{ width: 'auto' }} /> Ngân hàng
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', cursor: 'pointer', color: 'var(--text-primary)' }}>
                    <input type="checkbox" checked={visibleColumns.cardType} onChange={() => handleToggleColumn('cardType')} style={{ width: 'auto' }} /> Loại thẻ
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', cursor: 'pointer', color: 'var(--text-primary)' }}>
                    <input type="checkbox" checked={visibleColumns.classification} onChange={() => handleToggleColumn('classification')} style={{ width: 'auto' }} /> Phân loại
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', cursor: 'pointer', color: 'var(--text-primary)' }}>
                    <input type="checkbox" checked={visibleColumns.actions} onChange={() => handleToggleColumn('actions')} style={{ width: 'auto' }} /> Thao tác
                  </label>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
              <button className="btn btn-secondary" onClick={handleResetFilters} style={{ padding: '0.5rem 1rem' }}>
                Đặt lại
              </button>
              <button className="btn btn-primary" onClick={() => setShowFilterModal(false)} style={{ padding: '0.5rem 1rem' }}>
                Áp dụng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Split Modal */}
      {splittingTx && (
        <div className="modal-overlay">
          <div className="modal-content animate-fade-in" style={{ maxWidth: '480px' }}>
            <h3>Tách giao dịch (Split Expense)</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Chia nhỏ giao dịch gốc <strong>{splittingTx.amount.toLocaleString('vi-VN')} VND</strong> thành 2 giao dịch riêng biệt.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
              {/* Part 1 */}
              <div style={{ padding: '0.75rem', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius-md)' }}>
                <h4 style={{ fontSize: '0.85rem', color: 'var(--color-success)', marginBottom: '0.5rem' }}>Phần 1: Chi tiêu cá nhân</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <input
                    type="text"
                    placeholder="Mô tả phần 1"
                    value={splitDesc1}
                    onChange={(e) => setSplitDesc1(e.target.value)}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="number"
                      placeholder="Số tiền phần 1"
                      value={Math.abs(splitAmount1)}
                      onChange={(e) => {
                        const val = -(Math.abs(parseFloat(e.target.value) || 0));
                        setSplitAmount1(val);
                        // Auto-calculate part 2
                        setSplitAmount2(splittingTx.amount - val);
                      }}
                    />
                    <span style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>VND</span>
                  </div>
                </div>
              </div>

              {/* Part 2 */}
              <div style={{ padding: '0.75rem', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius-md)' }}>
                <h4 style={{ fontSize: '0.85rem', color: 'var(--color-primary)', marginBottom: '0.5rem' }}>Phần 2: Mua hộ / Gom nhóm</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <input
                    type="text"
                    placeholder="Mô tả phần 2"
                    value={splitDesc2}
                    onChange={(e) => setSplitDesc2(e.target.value)}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="number"
                      placeholder="Số tiền phần 2"
                      value={Math.abs(splitAmount2)}
                      onChange={(e) => {
                        const val = -(Math.abs(parseFloat(e.target.value) || 0));
                        setSplitAmount2(val);
                        // Auto-calculate part 1
                        setSplitAmount1(splittingTx.amount - val);
                      }}
                    />
                    <span style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>VND</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.25rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: '600' }}>Gán vào nhóm:</label>
                      <select value={splitGroup2} onChange={(e) => setSplitGroup2(e.target.value)} style={{ padding: '0.4rem', fontSize: '0.8rem' }}>
                        <option value="none">Cá nhân</option>
                        {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.15rem' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: '600' }}>Phân loại:</label>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={splitExclude2 || splitGroup2 !== 'none'}
                          onChange={(e) => setSplitExclude2(e.target.checked)}
                          disabled={splitGroup2 !== 'none'}
                          style={{ width: 'auto' }}
                        />
                        Loại trừ chi tiêu cá nhân
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
              <button className="btn btn-secondary" onClick={() => setSplittingTx(null)}>Hủy</button>
              <button className="btn btn-primary" onClick={handleSaveSplit}>Thực hiện tách</button>
            </div>
          </div>
        </div>
      )}
      {/* Smart Scan & Bulk Categorize Modal */}
      {scanTx && (
        <div className="modal-overlay">
          <div className="modal-content animate-fade-in" style={{ maxWidth: '520px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Sparkles size={20} color="var(--color-primary)" />
                Quét & Gán danh mục hàng loạt
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Tìm và phân loại hàng loạt các giao dịch tương đồng dựa trên từ khóa nội dung.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div style={{ backgroundColor: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: 'var(--border-radius-md)', border: '1px solid var(--border-color)', fontSize: '0.8rem' }}>
                <div style={{ fontWeight: '600', color: 'var(--text-secondary)' }}>Giao dịch gốc đã chọn:</div>
                <div style={{ color: 'var(--text-primary)', marginTop: '0.25rem', fontWeight: '500' }}>{scanTx.description}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem', color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>
                  <span>Ngày: {scanTx.date}</span>
                  <strong>Số tiền: {scanTx.amount.toLocaleString('vi-VN')} VND</strong>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: '700' }}>Từ khóa tìm kiếm:</label>
                  <input
                    type="text"
                    value={scanKeyword}
                    onChange={(e) => handleScanKeywordChange(e.target.value)}
                    placeholder="Ví dụ: GS25, HIGHLANDS..."
                    required
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: '700' }}>Danh mục muốn gán:</label>
                  <select
                    value={scanCategory}
                    onChange={(e) => setScanCategory(e.target.value)}
                  >
                    <option value="">-- Chưa gán danh mục --</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Preview Matching List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', fontWeight: '700' }}>
                  <span>📋 Kết quả tìm kiếm tương đồng ({matchingTxs.length}):</span>
                  {matchingTxs.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ padding: '0.15rem 0.5rem', fontSize: '0.75rem', height: 'auto' }}
                      onClick={() => {
                        if (selectedScanTxIds.length === matchingTxs.length) {
                          setSelectedScanTxIds([]);
                        } else {
                          setSelectedScanTxIds(matchingTxs.map(m => m.id));
                        }
                      }}
                    >
                      {selectedScanTxIds.length === matchingTxs.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                    </button>
                  )}
                </div>

                <div style={{
                  maxHeight: '180px',
                  overflowY: 'auto',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--border-radius-md)',
                  backgroundColor: 'var(--bg-secondary)'
                }}>
                  {matchingTxs.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {matchingTxs.map(t => {
                        const isChecked = selectedScanTxIds.includes(t.id);
                        const currentCat = categories.find(c => c.id === t.category);
                        return (
                          <div
                            key={t.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '0.5rem 0.75rem',
                              borderBottom: '1px solid var(--border-color)',
                              fontSize: '0.75rem'
                            }}
                          >
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', flex: '1', minWidth: 0, marginRight: '0.5rem' }}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  setSelectedScanTxIds(prev =>
                                    prev.includes(t.id) ? prev.filter(id => id !== t.id) : [...prev, t.id]
                                  );
                                }}
                                style={{ width: 'auto' }}
                              />
                              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                <span style={{ fontWeight: '500', color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{t.description}</span>
                                <span style={{ color: 'var(--text-tertiary)', fontSize: '0.7rem' }}>{t.date} • {t.amount.toLocaleString('vi-VN')} VND</span>
                              </div>
                            </label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              {currentCat ? (
                                <span className="badge" style={{ backgroundColor: `${currentCat.color}15`, color: currentCat.color, padding: '0.1rem 0.35rem', fontSize: '0.65rem' }}>
                                  {currentCat.name}
                                </span>
                              ) : (
                                <span style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)' }}>Chưa phân loại</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>
                      {scanKeyword.trim() ? 'Không tìm thấy giao dịch tương tự nào khác.' : 'Vui lòng nhập từ khóa để quét.'}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.85rem' }}>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setScanTx(null);
                  setSelectedScanTxIds([]);
                }}
              >
                Hủy
              </button>
              <button
                className="btn btn-primary"
                onClick={handleApplyBulkScan}
                disabled={selectedScanTxIds.length === 0 || !scanCategory}
              >
                Gán danh mục cho {selectedScanTxIds.length} giao dịch
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
