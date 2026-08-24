import React, { useState, useMemo } from 'react';
import { Group, Trash2, Edit3, ShieldCheck, ToggleLeft, ToggleRight, X, Eye, EyeOff } from 'lucide-react';
import type { Transaction, Group as TxGroup } from '../utils/db';

interface GroupManagerProps {
  transactions: Transaction[];
  groups: TxGroup[];
  onUpdateGroups: (updated: TxGroup[]) => void;
  onDeleteGroup: (groupId: string) => void;
  onUpdateTransactions: (updated: Transaction[]) => void;
}

export const GroupManager: React.FC<GroupManagerProps> = ({
  transactions,
  groups,
  onUpdateGroups,
  onDeleteGroup,
  onUpdateTransactions,
}) => {
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>('');
  
  // Expanded detail group state
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

  // Manual empty group create
  const [newGroupName, setNewGroupName] = useState<string>('');

  // Calculate statistics for each group
  const groupStats = useMemo(() => {
    const stats: Record<string, { total: number; count: number; transactions: Transaction[] }> = {};
    
    groups.forEach(g => {
      stats[g.id] = { total: 0, count: 0, transactions: [] };
    });

    transactions.forEach(t => {
      if (t.groupId && stats[t.groupId]) {
        stats[t.groupId].total += t.amount;
        stats[t.groupId].count += 1;
        stats[t.groupId].transactions.push(t);
      }
    });

    return stats;
  }, [transactions, groups]);

  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    const newGroup: TxGroup = {
      id: `group_${Date.now()}`,
      name: newGroupName.trim(),
      excludeFromPersonal: true, // Default to true (bought for others)
    };

    onUpdateGroups([...groups, newGroup]);
    setNewGroupName('');
  };

  const handleStartRename = (g: TxGroup) => {
    setEditingGroupId(g.id);
    setEditName(g.name);
  };

  const handleSaveRename = () => {
    if (!editingGroupId || !editName.trim()) return;

    const updated = groups.map(g => 
      g.id === editingGroupId ? { ...g, name: editName.trim() } : g
    );
    onUpdateGroups(updated);
    setEditingGroupId(null);
  };

  const handleToggleExclude = (group: TxGroup) => {
    const newExcludeValue = !group.excludeFromPersonal;
    
    // Update Group Object
    const updatedGroups = groups.map(g => 
      g.id === group.id ? { ...g, excludeFromPersonal: newExcludeValue } : g
    );
    onUpdateGroups(updatedGroups);

    // Sync all transactions in this group
    const groupTxs = transactions
      .filter(t => t.groupId === group.id)
      .map(t => ({ ...t, excludeFromPersonal: newExcludeValue }));
    
    if (groupTxs.length > 0) {
      onUpdateTransactions(groupTxs);
    }
  };

  const handleDelete = (groupId: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa nhóm này? Các giao dịch bên trong nhóm sẽ được giải phóng trở lại chi tiêu cá nhân bình thường.')) {
      onDeleteGroup(groupId);
      if (expandedGroupId === groupId) {
        setExpandedGroupId(null);
      }
    }
  };

  const handleRemoveFromGroup = (tx: Transaction) => {
    const updated = {
      ...tx,
      groupId: null,
      excludeFromPersonal: false,
    };
    onUpdateTransactions([updated]);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }} className="animate-fade-in">
      
      {/* Groups List */}
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
          <h3>Danh sách Nhóm Giao dịch</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Quản lý các nhóm chi tiêu riêng để đối soát, thanh toán hoặc chia tiền.
          </p>
        </div>

        {/* Add Group Form */}
        <form onSubmit={handleCreateGroup} style={{ display: 'flex', gap: '0.5rem' }}>
          <input 
            type="text" 
            placeholder="Tạo nhanh nhóm mới (ví dụ: Mua hộ phòng HR)..." 
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            style={{ fontSize: '0.85rem' }}
          />
          <button type="submit" className="btn btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>Tạo</button>
        </form>

        {/* Groups Items */}
        {groups.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Chưa có nhóm giao dịch nào được tạo. Hãy chọn các giao dịch từ bảng để gom nhóm.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '450px', overflowY: 'auto' }} className="scroller">
            {groups.map(g => {
              const stats = groupStats[g.id] || { total: 0, count: 0 };
              const isEditing = editingGroupId === g.id;
              const isExpanded = expandedGroupId === g.id;

              return (
                <div 
                  key={g.id} 
                  style={{ 
                    border: '1px solid var(--border-color)', 
                    borderRadius: 'var(--border-radius-md)',
                    backgroundColor: isExpanded ? 'var(--bg-secondary)' : 'var(--surface-primary)',
                    padding: '1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                    transition: 'all var(--transition-fast)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    
                    {/* Name / Rename Input */}
                    {isEditing ? (
                      <div style={{ display: 'flex', gap: '0.25rem', flex: '1', marginRight: '1rem' }}>
                        <input 
                          type="text" 
                          value={editName} 
                          onChange={(e) => setEditName(e.target.value)}
                          style={{ padding: '0.35rem 0.5rem', fontSize: '0.9rem' }}
                          required
                        />
                        <button className="btn btn-primary" style={{ padding: '0.25rem 0.5rem' }} onClick={handleSaveRename}><ShieldCheck size={14} /></button>
                        <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem' }} onClick={() => setEditingGroupId(null)}><X size={14} /></button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Group size={16} color="var(--color-primary)" />
                        <span style={{ fontWeight: '700', fontSize: '0.95rem' }}>{g.name}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>({stats.count} giao dịch)</span>
                      </div>
                    )}

                    {/* Actions */}
                    {!isEditing && (
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <button className="btn btn-ghost" style={{ padding: '0.25rem' }} onClick={() => setExpandedGroupId(isExpanded ? null : g.id)}>
                          {isExpanded ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                        <button className="btn btn-ghost" style={{ padding: '0.25rem' }} onClick={() => handleStartRename(g)}>
                          <Edit3 size={14} />
                        </button>
                        <button className="btn btn-ghost" style={{ padding: '0.25rem', color: 'var(--color-danger)' }} onClick={() => handleDelete(g.id)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Summary Stats */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                    <div>
                      <span style={{ color: 'var(--text-secondary)' }}>Tổng chi phí nhóm:</span>
                      <strong style={{ marginLeft: '0.5rem', color: 'var(--color-primary)', fontSize: '0.95rem' }}>
                        {Math.abs(stats.total).toLocaleString('vi-VN')} VND
                      </strong>
                    </div>

                    {/* Exclude Toggle */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Loại trừ chi tiêu cá nhân</span>
                      <button 
                        onClick={() => handleToggleExclude(g)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: g.excludeFromPersonal ? 'var(--color-primary)' : 'var(--text-tertiary)' }}
                      >
                        {g.excludeFromPersonal ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Expanded Group Details Tab */}
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
          <h3>Chi tiết Giao dịch Nhóm</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {expandedGroupId ? `Hiển thị danh sách giao dịch của nhóm đang chọn` : `Nhấn biểu tượng con mắt bên cạnh nhóm để xem chi tiết`}
          </p>
        </div>

        {expandedGroupId ? (
          <div>
            <h4 style={{ color: 'var(--color-primary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              Nhóm: {groups.find(g => g.id === expandedGroupId)?.name}
            </h4>
            
            {(groupStats[expandedGroupId]?.transactions.length || 0) === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                Không có giao dịch nào trong nhóm này.
              </div>
            ) : (
              <div className="table-container scroller" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                <table className="table-el" style={{ fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th>Ngày</th>
                      <th>Nội dung</th>
                      <th style={{ textAlign: 'right' }}>Số tiền</th>
                      <th style={{ width: '60px', textAlign: 'center' }}>Bỏ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupStats[expandedGroupId]?.transactions.map((tx) => (
                      <tr key={tx.id}>
                        <td>{tx.date}</td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span>{tx.description}</span>
                            {tx.isSplit && <span style={{ fontSize: '0.7rem', color: 'var(--color-primary)' }}>[Đã tách]</span>}
                          </div>
                        </td>
                        <td style={{ 
                          textAlign: 'right', 
                          fontWeight: '700', 
                          color: tx.amount > 0 ? 'var(--color-success)' : 'var(--color-danger)' 
                        }}>
                          {tx.amount.toLocaleString('vi-VN')} VND
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button 
                            className="btn btn-ghost"
                            style={{ padding: '0.2rem', color: 'var(--color-danger)' }}
                            onClick={() => handleRemoveFromGroup(tx)}
                            title="Xóa khỏi nhóm"
                          >
                            <X size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div style={{ 
            height: '200px', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            color: 'var(--text-tertiary)',
            border: '1px dashed var(--border-color)',
            borderRadius: 'var(--border-radius-md)',
            fontSize: '0.9rem'
          }}>
            Vui lòng chọn xem chi tiết một nhóm ở bảng bên trái.
          </div>
        )}
      </div>

    </div>
  );
};
