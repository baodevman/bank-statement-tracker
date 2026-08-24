import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Settings, 
  Trash2, 
  UserX, 
  UserCheck, 
  Plus, 
  RefreshCw,
  Search,
  Sliders
} from 'lucide-react';
import { 
  fetchAllUsers, 
  fetchTemplates, 
  saveUserDoc, 
  saveTemplateDoc, 
  deleteTemplateDoc,
  type AppUser
} from '../utils/bankTemplateService';
import type { BankMappingTemplate } from '../utils/db';

export const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'users' | 'templates'>('users');
  const [users, setUsers] = useState<AppUser[]>([]);
  const [templates, setTemplates] = useState<BankMappingTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // User form modals state
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newLimit, setNewLimit] = useState(5);
  const [newIsPremium, setNewIsPremium] = useState(false);

  // Template form state
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<BankMappingTemplate | null>(null);
  const [tBankName, setTBankName] = useState('');
  const [tDateCol, setTDateCol] = useState(0);
  const [tAmountCol, setTAmountCol] = useState(1);
  const [tDescCol, setTDescCol] = useState(2);
  const [tCardCol, setTCardCol] = useState(-1);
  const [tHasHeader, setTHasHeader] = useState(true);

  const loadAllData = async () => {
    setIsLoading(true);
    try {
      const u = await fetchAllUsers();
      const t = await fetchTemplates();
      setUsers(u);
      setTemplates(t);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const handleToggleUserStatus = async (user: AppUser) => {
    const updated = { 
      ...user, 
      isDisabled: !user.isDisabled,
      updatedAt: new Date().toISOString()
    };
    // Optimistic UI update
    setUsers(users.map(u => u.email === user.email ? updated : u));
    await saveUserDoc(updated);
  };

  const handleToggleUserPremium = async (user: AppUser) => {
    const updated = { 
      ...user, 
      isPremium: !user.isPremium,
      updatedAt: new Date().toISOString()
    };
    // Optimistic UI update
    setUsers(users.map(u => u.email === user.email ? updated : u));
    await saveUserDoc(updated);
  };

  const handleUpdateLimit = async (user: AppUser, limitStr: string) => {
    const limit = parseInt(limitStr, 10);
    if (isNaN(limit) || limit < 0) return;
    const updated = { 
      ...user, 
      dailyUploadLimit: limit,
      updatedAt: new Date().toISOString()
    };
    setUsers(users.map(u => u.email === user.email ? updated : u));
    await saveUserDoc(updated);
  };

  const handleAddUser = async () => {
    if (!newEmail.trim() || !newEmail.includes('@')) {
      alert('Vui lòng nhập địa chỉ email hợp lệ.');
      return;
    }
    const exists = users.find(u => u.email.toLowerCase() === newEmail.toLowerCase().trim());
    if (exists) {
      alert('Tài khoản người dùng này đã tồn tại.');
      return;
    }

    const newUser: AppUser = {
      email: newEmail.trim().toLowerCase(),
      isPremium: newIsPremium,
      isDisabled: false,
      dailyUploadLimit: newLimit,
      uploadsToday: 0,
      lastUploadDate: new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString()
    };

    setUsers([newUser, ...users]);
    await saveUserDoc(newUser);
    setShowAddUserModal(false);
    setNewEmail('');
    setNewLimit(5);
    setNewIsPremium(false);
  };

  const handleSaveTemplate = async () => {
    if (!tBankName.trim()) {
      alert('Vui lòng nhập tên ngân hàng.');
      return;
    }

    const templateId = editingTemplate?.id || tBankName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const newTemplate: BankMappingTemplate = {
      id: templateId,
      bankName: tBankName.trim(),
      dateColIndex: tDateCol,
      amountColIndex: tAmountCol,
      descColIndex: tDescCol,
      cardColIndex: tCardCol >= 0 ? tCardCol : undefined,
      hasHeader: tHasHeader,
      updatedAt: new Date().toISOString()
    };

    if (editingTemplate) {
      setTemplates(templates.map(t => t.id === editingTemplate.id ? newTemplate : t));
    } else {
      setTemplates([newTemplate, ...templates]);
    }

    await saveTemplateDoc(newTemplate);
    setShowTemplateModal(false);
    setEditingTemplate(null);
    clearTemplateFields();
  };

  const handleDeleteTemplate = async (id: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa mẫu định dạng này khỏi hệ thống?')) {
      setTemplates(templates.filter(t => t.id !== id));
      await deleteTemplateDoc(id);
    }
  };

  const clearTemplateFields = () => {
    setTBankName('');
    setTDateCol(0);
    setTAmountCol(1);
    setTDescCol(2);
    setTCardCol(-1);
    setTHasHeader(true);
  };

  const filteredUsers = users.filter(u => 
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
      
      {/* Admin dashboard header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2>Trang Quản trị Hệ thống (Admin Panel)</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
            Quản lý tập trung tài khoản người dùng, cấu hình hạn mức và mẫu định dạng sao kê ngân hàng.
          </p>
        </div>
        <button 
          className="btn btn-secondary" 
          onClick={loadAllData} 
          disabled={isLoading}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          Làm mới
        </button>
      </div>

      {/* Tabs list */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button 
            className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Users size={16} /> Người dùng ({users.length})
          </button>
          <button 
            className={`tab-btn ${activeTab === 'templates' ? 'active' : ''}`}
            onClick={() => setActiveTab('templates')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Sliders size={16} /> Mẫu Ngân hàng ({templates.length})
          </button>
        </div>

        {/* Add actions and search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {activeTab === 'users' ? (
            <>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Search size={14} style={{ position: 'absolute', left: '0.5rem', color: 'var(--text-tertiary)' }} />
                <input 
                  type="text" 
                  placeholder="Tìm email..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input-field"
                  style={{ paddingLeft: '1.75rem', width: '200px', fontSize: '0.8rem', height: '32px' }}
                />
              </div>
              <button 
                className="btn btn-primary" 
                onClick={() => setShowAddUserModal(true)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
              >
                <Plus size={14} /> Thêm User
              </button>
            </>
          ) : (
            <button 
              className="btn btn-primary" 
              onClick={() => {
                setEditingTemplate(null);
                clearTemplateFields();
                setShowTemplateModal(true);
              }}
              style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
            >
              <Plus size={14} /> Thêm Mẫu Định Dạng
            </button>
          )}
        </div>
      </div>

      {/* Main Tab content area */}
      <div className="glass-card animate-fade-in" style={{ padding: '1rem' }}>
        
        {/* User Management Tab */}
        {activeTab === 'users' && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Tài khoản (Email)</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Hạn mức / ngày</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Đã tải hôm nay</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Gói Premium</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Trạng thái</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                      Không tìm thấy người dùng nào.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr key={u.email} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: '500' }}>{u.email}</td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        <input 
                          type="number"
                          value={u.dailyUploadLimit}
                          onChange={(e) => handleUpdateLimit(u, e.target.value)}
                          className="input-field"
                          style={{ width: '60px', padding: '0.2rem', textAlign: 'center', fontSize: '0.8rem' }}
                          min={0}
                        />
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>{u.uploadsToday || 0} file</td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        <span 
                          onClick={() => handleToggleUserPremium(u)}
                          className={`badge ${u.isPremium ? 'badge-success' : 'badge-danger'}`}
                          style={{ cursor: 'pointer' }}
                        >
                          {u.isPremium ? 'Premium (Mở khóa)' : 'Cơ bản (Khóa)'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        <span className={`badge ${u.isDisabled ? 'badge-danger' : 'badge-success'}`}>
                          {u.isDisabled ? 'Bị vô hiệu hóa' : 'Đang hoạt động'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        <button 
                          className="btn btn-ghost" 
                          onClick={() => handleToggleUserStatus(u)}
                          style={{ padding: '0.35rem', color: u.isDisabled ? 'var(--color-success)' : 'var(--color-danger)' }}
                          title={u.isDisabled ? 'Kích hoạt tài khoản' : 'Vô hiệu hóa tài khoản'}
                        >
                          {u.isDisabled ? <UserCheck size={16} /> : <UserX size={16} />}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Templates Management Tab */}
        {activeTab === 'templates' && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Ngân hàng</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Cột Ngày</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Cột Số tiền</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Cột Nội dung</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Cột Số thẻ</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Bỏ dòng đầu</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {templates.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                      Chưa có mẫu cấu hình cột nào được thiết lập.
                    </td>
                  </tr>
                ) : (
                  templates.map((t) => (
                    <tr key={t.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: '500' }}>{t.bankName}</td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Cột {t.dateColIndex}</td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Cột {t.amountColIndex}</td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Cột {t.descColIndex}</td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        {t.cardColIndex !== undefined ? `Cột ${t.cardColIndex}` : 'Không có'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        <span className={`badge ${t.hasHeader ? 'badge-success' : 'badge-danger'}`}>
                          {t.hasHeader ? 'Bỏ qua' : 'Đọc luôn'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <button 
                          className="btn btn-ghost" 
                          onClick={() => {
                            setEditingTemplate(t);
                            setTBankName(t.bankName);
                            setTDateCol(t.dateColIndex);
                            setTAmountCol(t.amountColIndex);
                            setTDescCol(t.descColIndex);
                            setTCardCol(t.cardColIndex !== undefined ? t.cardColIndex : -1);
                            setTHasHeader(t.hasHeader);
                            setShowTemplateModal(true);
                          }}
                          style={{ padding: '0.35rem' }}
                          title="Sửa mẫu định dạng"
                        >
                          <Settings size={16} />
                        </button>
                        <button 
                          className="btn btn-ghost text-danger" 
                          onClick={() => handleDeleteTemplate(t.id)}
                          style={{ padding: '0.35rem' }}
                          title="Xóa mẫu định dạng"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

      </div>

      {/* --- ADD USER MODAL --- */}
      {showAddUserModal && (
        <div className="modal-overlay" onClick={() => setShowAddUserModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <h3 style={{ margin: '0 0 1rem 0' }}>Thêm tài khoản User mới</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: '600' }}>Email đăng nhập:</label>
                <input 
                  type="email" 
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="input-field"
                  placeholder="user@gmail.com"
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: '600' }}>Hạn mức upload/ngày:</label>
                <input 
                  type="number" 
                  value={newLimit}
                  onChange={(e) => setNewLimit(parseInt(e.target.value, 10))}
                  className="input-field"
                  min={0}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                <input 
                  type="checkbox"
                  checked={newIsPremium}
                  onChange={(e) => setNewIsPremium(e.target.checked)}
                  id="chk-new-premium"
                  style={{ cursor: 'pointer' }}
                />
                <label htmlFor="chk-new-premium" style={{ fontSize: '0.85rem', cursor: 'pointer' }}>
                  Kích hoạt sẵn tài khoản Premium (Mở khóa upload)
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.5rem' }}>
              <button className="btn btn-secondary" onClick={() => setShowAddUserModal(false)}>Hủy</button>
              <button className="btn btn-primary" onClick={handleAddUser}>Lưu người dùng</button>
            </div>
          </div>
        </div>
      )}

      {/* --- ADD/EDIT TEMPLATE MODAL --- */}
      {showTemplateModal && (
        <div className="modal-overlay" onClick={() => setShowTemplateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '450px' }}>
            <h3 style={{ margin: '0 0 1rem 0' }}>
              {editingTemplate ? 'Chỉnh sửa Mẫu ngân hàng' : 'Thêm mới Mẫu cấu hình cột'}
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: '600' }}>Tên Ngân hàng:</label>
                <input 
                  type="text" 
                  value={tBankName}
                  onChange={(e) => setTBankName(e.target.value)}
                  className="input-field"
                  placeholder="Ví dụ: ACB, Techcombank..."
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: '600' }}>📅 Chỉ số cột Ngày:</label>
                  <input 
                    type="number" 
                    value={tDateCol}
                    onChange={(e) => setTDateCol(parseInt(e.target.value, 10))}
                    className="input-field"
                    min={0}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: '600' }}>💵 Chỉ số cột Số tiền:</label>
                  <input 
                    type="number" 
                    value={tAmountCol}
                    onChange={(e) => setTAmountCol(parseInt(e.target.value, 10))}
                    className="input-field"
                    min={0}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: '600' }}>📝 Chỉ số cột Nội dung:</label>
                  <input 
                    type="number" 
                    value={tDescCol}
                    onChange={(e) => setTDescCol(parseInt(e.target.value, 10))}
                    className="input-field"
                    min={0}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: '600' }}>💳 Chỉ số cột Số thẻ (-1 nếu bỏ):</label>
                  <input 
                    type="number" 
                    value={tCardCol}
                    onChange={(e) => setTCardCol(parseInt(e.target.value, 10))}
                    className="input-field"
                    min={-1}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                <input 
                  type="checkbox"
                  checked={tHasHeader}
                  onChange={(e) => setTHasHeader(e.target.checked)}
                  id="chk-has-header"
                  style={{ cursor: 'pointer' }}
                />
                <label htmlFor="chk-has-header" style={{ fontSize: '0.85rem', cursor: 'pointer' }}>
                  Bỏ qua dòng đầu tiên chứa tiêu đề cột
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.5rem' }}>
              <button className="btn btn-secondary" onClick={() => setShowTemplateModal(false)}>Hủy</button>
              <button className="btn btn-primary" onClick={handleSaveTemplate}>Lưu cấu hình</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
