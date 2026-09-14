import React, { useState, useMemo } from 'react';
import { Filter, Search, X, Eye, EyeOff } from 'lucide-react';
import type { Transaction, Category, Group } from '../utils/db';

interface GroupTableViewProps {
  transactions: Transaction[];
  categories: Category[];
  groups: Group[];
  selectedStatement?: string;
  onUpdateTransactions: (updated: Transaction[]) => void;
  onDeleteTransactions?: (ids: string[]) => void;
  onCreateGroup?: (name: string, txIds: string[]) => void;
}

interface TableConfig {
  id: string; // group id or 'personal' or 'personal_exclude'
  name: string;
  searchTerm: string;
  selectedCategory: string;
  selectedBank: string;
  showHidden: boolean;
}

export const GroupTableView: React.FC<GroupTableViewProps> = ({
  transactions,
  categories,
  groups,
  onUpdateTransactions,
}) => {
  // Available groups
  const availableGroups = useMemo(() => [
    { id: 'personal', name: 'Cá nhân' },
    { id: 'personal_exclude', name: 'Mua hộ tự do' },
    ...groups.map(g => ({ id: g.id, name: g.name }))
  ], [groups]);

  // Active table configurations
  const [activeTables, setActiveTables] = useState<TableConfig[]>([
    { id: 'personal', name: 'Cá nhân', searchTerm: '', selectedCategory: 'all', selectedBank: 'all', showHidden: false },
    { id: 'personal_exclude', name: 'Mua hộ tự do', searchTerm: '', selectedCategory: 'all', selectedBank: 'all', showHidden: false },
    ...groups.map(g => ({ id: g.id, name: g.name, searchTerm: '', selectedCategory: 'all', selectedBank: 'all', showHidden: false }))
  ]);

  // Per-table filter modal state
  const [activeFilterModalTableId, setActiveFilterModalTableId] = useState<string | null>(null);

  // Available banks list
  const availableBanks = useMemo(() => {
    const banks = new Set<string>();
    transactions.forEach(t => { if (t.bank) banks.add(t.bank); });
    return Array.from(banks).sort();
  }, [transactions]);

  const handleAddTable = (groupId: string) => {
    if (activeTables.some(t => t.id === groupId)) return;
    const match = availableGroups.find(g => g.id === groupId);
    if (!match) return;
    setActiveTables(prev => [...prev, {
      id: groupId,
      name: match.name,
      searchTerm: '',
      selectedCategory: 'all',
      selectedBank: 'all',
      showHidden: false,
    }]);
  };

  const handleRemoveTable = (tableId: string) => {
    setActiveTables(prev => prev.filter(t => t.id !== tableId));
  };

  const updateTableConfig = (tableId: string, updates: Partial<TableConfig>) => {
    setActiveTables(prev => prev.map(t => t.id === tableId ? { ...t, ...updates } : t));
  };

  const formatDateDisplay = (dateStr: string): string => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    return dateStr;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} className="animate-fade-in">
      {/* Top Add Table Bar */}
      <div className="glass-card" style={{ padding: '0.85rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span>📊 Quản lý Bảng Giao Dịch theo Nhóm:</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Thêm bảng nhóm:</span>
          <select
            onChange={(e) => {
              if (e.target.value) {
                handleAddTable(e.target.value);
                e.target.value = '';
              }
            }}
            style={{ fontSize: '0.8rem', padding: '0.35rem 0.65rem' }}
          >
            <option value="">+ Chọn nhóm để thêm bảng...</option>
            {availableGroups.filter(g => !activeTables.some(t => t.id === g.id)).map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid of Independent Tables */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
        {activeTables.map(cfg => {
          // Get transactions belonging to this table's group
          let groupTxs = transactions.filter(t => {
            if (cfg.id === 'personal') return !t.groupId && !t.excludeFromPersonal;
            if (cfg.id === 'personal_exclude') return !t.groupId && t.excludeFromPersonal;
            return t.groupId === cfg.id;
          });

          // Apply table specific filters
          const filteredTxs = groupTxs.filter(t => {
            if (!cfg.showHidden && t.isHidden) return false;
            const matchesSearch = !cfg.searchTerm || t.description.toLowerCase().includes(cfg.searchTerm.toLowerCase().trim());
            const matchesCat = cfg.selectedCategory === 'all' || t.category === cfg.selectedCategory;
            const matchesBank = cfg.selectedBank === 'all' || t.bank === cfg.selectedBank;
            return matchesSearch && matchesCat && matchesBank;
          });

          // Calculate subtotal debt for this table
          let tableNetDebt = 0;
          filteredTxs.forEach(t => {
            const isRefund = t.isRefund || t.amount > 0;
            const absVal = Math.abs(t.amount);
            tableNetDebt += isRefund ? -absVal : absVal;
          });

          return (
            <div key={cfg.id} className="glass-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Table Card Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--color-primary)' }}>{cfg.name}</h3>
                  <span className="badge" style={{ backgroundColor: 'rgba(99, 102, 241, 0.12)', color: 'var(--color-primary)', fontSize: '0.75rem' }}>
                    {filteredTxs.length} giao dịch
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {/* Table Search */}
                  <div style={{ position: 'relative', width: '200px' }}>
                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '9px', color: 'var(--text-tertiary)' }} />
                    <input
                      type="text"
                      placeholder="Tìm kiếm..."
                      value={cfg.searchTerm}
                      onChange={(e) => updateTableConfig(cfg.id, { searchTerm: e.target.value })}
                      style={{ paddingLeft: '2.25rem', fontSize: '0.8rem', height: '34px' }}
                    />
                  </div>

                  {/* Table Hide Toggle */}
                  <button
                    className={`btn ${cfg.showHidden ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', height: '34px', gap: '0.3rem' }}
                    onClick={() => updateTableConfig(cfg.id, { showHidden: !cfg.showHidden })}
                  >
                    {cfg.showHidden ? <Eye size={14} /> : <EyeOff size={14} />}
                    <span>{cfg.showHidden ? 'Hiện ẩn' : 'Item ẩn'}</span>
                  </button>

                  {/* Compact Table Filter Button */}
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', height: '34px', gap: '0.3rem' }}
                    onClick={() => setActiveFilterModalTableId(cfg.id)}
                  >
                    <Filter size={14} />
                    <span>Lọc bảng này</span>
                  </button>

                  {/* Net Debt Badge */}
                  <div style={{ backgroundColor: 'var(--bg-secondary)', padding: '0.35rem 0.75rem', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--border-color)', fontSize: '0.825rem' }}>
                    <span style={{ color: 'var(--text-secondary)', marginRight: '0.35rem' }}>Dư nợ:</span>
                    <strong style={{ color: tableNetDebt >= 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                      {tableNetDebt.toLocaleString('vi-VN')} VND
                    </strong>
                  </div>

                  {activeTables.length > 1 && (
                    <button className="btn btn-ghost" style={{ padding: '0.25rem', color: 'var(--text-tertiary)' }} onClick={() => handleRemoveTable(cfg.id)}>
                      <X size={16} />
                    </button>
                  )}
                </div>
              </div>

              {/* Table Data */}
              <div className="table-container" style={{ maxHeight: '420px', overflow: 'auto' }}>
                <table className="table-el">
                  <thead style={{ position: 'sticky', top: 0, zIndex: 5, backgroundColor: 'var(--bg-card)' }}>
                    <tr>
                      <th style={{ width: '90px' }}>Ngày</th>
                      <th style={{ width: '110px' }}>Ngân hàng</th>
                      <th>Nội dung giao dịch</th>
                      <th style={{ width: '120px' }}>Danh mục</th>
                      <th style={{ textAlign: 'right', width: '140px' }}>Số tiền</th>
                      <th style={{ width: '60px', textAlign: 'center' }}>Ẩn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTxs.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-tertiary)' }}>
                          Không có giao dịch nào trong bảng nhóm này.
                        </td>
                      </tr>
                    ) : (
                      filteredTxs.map(tx => {
                        const catObj = categories.find(c => c.id === tx.category);
                        return (
                          <tr key={tx.id} style={{ opacity: tx.isHidden ? 0.6 : 1 }}>
                            <td style={{ whiteSpace: 'nowrap' }}>{formatDateDisplay(tx.date)}</td>
                            <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{tx.bank}</td>
                            <td style={{ fontWeight: '500', textDecoration: tx.isHidden ? 'line-through' : 'none' }}>
                              {tx.description}
                            </td>
                            <td>
                              {catObj && (
                                <span className="badge" style={{ backgroundColor: `${catObj.color}15`, color: catObj.color, fontSize: '0.75rem' }}>
                                  {catObj.name}
                                </span>
                              )}
                            </td>
                            <td style={{
                              textAlign: 'right',
                              fontWeight: '700',
                              color: (tx.isRefund || tx.amount > 0) ? 'var(--color-success)' : 'var(--color-danger)',
                              whiteSpace: 'nowrap',
                              textDecoration: tx.isHidden ? 'line-through' : 'none'
                            }}>
                              {tx.isRefund ? `+${Math.abs(tx.amount).toLocaleString('vi-VN')} VND` : `${tx.amount > 0 ? '+' : ''}${tx.amount.toLocaleString('vi-VN')} VND`}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button
                                className="btn btn-ghost"
                                style={{ padding: '0.2rem', color: tx.isHidden ? 'var(--color-warning)' : 'var(--text-tertiary)' }}
                                onClick={() => onUpdateTransactions([{ ...tx, isHidden: !tx.isHidden }])}
                              >
                                {tx.isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Per-Table Filter Modal */}
              {activeFilterModalTableId === cfg.id && (
                <div className="modal-overlay" style={{ zIndex: 1200 }}>
                  <div className="modal-content animate-fade-in" style={{ maxWidth: '380px', width: '90%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                      <h4 style={{ margin: 0 }}>Lọc riêng cho {cfg.name}</h4>
                      <button className="btn btn-ghost" onClick={() => setActiveFilterModalTableId(null)}><X size={16} /></button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>Danh mục:</label>
                        <select value={cfg.selectedCategory} onChange={e => updateTableConfig(cfg.id, { selectedCategory: e.target.value })}>
                          <option value="all">Tất cả danh mục</option>
                          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>Ngân hàng:</label>
                        <select value={cfg.selectedBank} onChange={e => updateTableConfig(cfg.id, { selectedBank: e.target.value })}>
                          <option value="all">Tất cả ngân hàng</option>
                          {availableBanks.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
                      <button className="btn btn-primary" onClick={() => setActiveFilterModalTableId(null)}>Đóng</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
