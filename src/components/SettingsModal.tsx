import React, { useState, useEffect } from 'react';
import { 
  Plus, Trash2, Tag, BookOpen, RefreshCw, Eye, EyeOff, Edit, X, 
  UploadCloud, Database, Lock, Loader2, Archive
} from 'lucide-react';
import type { Category, CategoryRule, SavedStatement } from '../utils/db';
import { 
  getBankPasswords, saveBankPasswords, getAppSettings
} from '../utils/db';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  rules: CategoryRule[];
  onUpdateRules: (newRules: CategoryRule[]) => void;
  onUpdateCategories: (newCats: Category[]) => void;
  onApplyRulesToAll: () => void;
  
  // Statement Files
  statementFiles: SavedStatement[];
  isRebuilding: boolean;
  onDeleteStatement: (id: string, name: string) => Promise<void>;
  onRenameStatement: (id: string, oldName: string) => Promise<void>;
  onUpdatePrivacyMode: (mode: 'temporary' | 'aggregate' | 'full') => void;
  onUpdateCloudSync: (enabled: boolean) => void;
  onResetAllData: () => void;

  // Archive
  archivedPeriods: string[];
  onUpdateArchivedPeriods: (periods: string[]) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  categories,
  rules,
  onUpdateRules,
  onUpdateCategories,
  onApplyRulesToAll,
  statementFiles,
  isRebuilding,
  onDeleteStatement,
  onRenameStatement,
  onUpdatePrivacyMode,
  onUpdateCloudSync,
  onResetAllData,
  archivedPeriods,
  onUpdateArchivedPeriods
}) => {
  const [activeSettingTab, setActiveSettingTab] = useState<'rules' | 'categories' | 'passwords' | 'files' | 'privacy' | 'archive'>('rules');

  // Privacy & Cloud Sync Mode states
  const [privacyMode, setPrivacyMode] = useState<'temporary' | 'aggregate' | 'full'>('full');
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState<boolean>(false);

  // Rule form states
  const [newKeyword, setNewKeyword] = useState<string>('');
  const [newRuleCategory, setNewRuleCategory] = useState<string>(categories[1]?.id || 'dining');

  // Category form states
  const [newCatName, setNewCatName] = useState<string>('');
  const [newCatColor, setNewCatColor] = useState<string>('#6366f1');

  // Password management states
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [selectedBank, setSelectedBank] = useState<string>('Shinhan Bank');
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [editingBank, setEditingBank] = useState<string>('');
  const [visibleBanks, setVisibleBanks] = useState<Record<string, boolean>>({});

  const statementPeriods = React.useMemo(() => {
    const periods = statementFiles.map(f => {
      const d = new Date(f.importedAt);
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const y = d.getFullYear();
      return {
        key: `${m}-${y}`,
        label: `Tháng ${m} / ${y}`
      };
    });
    const unique = new Map(periods.map(p => [p.key, p]));
    return Array.from(unique.values()).sort((a, b) => b.key.localeCompare(a.key));
  }, [statementFiles]);

  // User banks list states
  useEffect(() => {
    if (isOpen) {
      setPasswords(getBankPasswords());
      const s = getAppSettings();
      setPrivacyMode(s.privacyMode || 'full');
      setCloudSyncEnabled(!!s.cloudSyncEnabled);
    }
  }, [isOpen]);

  if (!isOpen) return null;


  // Add auto-categorization rule
  const handleAddRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyword.trim()) return;

    const keyword = newKeyword.trim().toLowerCase();
    
    if (rules.find(r => r.keyword === keyword)) {
      alert('Quy tắc cho từ khóa này đã tồn tại.');
      return;
    }

    const newRule: CategoryRule = {
      id: `rule_${Date.now()}`,
      keyword,
      categoryId: newRuleCategory,
    };

    onUpdateRules([...rules, newRule]);
    setNewKeyword('');
  };

  const handleDeleteRule = (id: string) => {
    onUpdateRules(rules.filter(r => r.id !== id));
  };

  // Add custom category
  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    const catId = `custom_${Date.now()}`;
    const newCat: Category = {
      id: catId,
      name: newCatName.trim(),
      color: newCatColor,
      isCustom: true,
    };

    onUpdateCategories([...categories, newCat]);
    setNewCatName('');
  };

  const handleDeleteCategory = (catId: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa danh mục này? Các giao dịch thuộc danh mục này sẽ tự động chuyển về danh mục "Khác".')) {
      onUpdateCategories(categories.filter(c => c.id !== catId));
    }
  };

  // Saved Bank Passwords handlers
  const handleSavePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput.trim()) return;
    
    const updated = { ...passwords, [selectedBank]: passwordInput.trim() };
    saveBankPasswords(updated);
    setPasswords(updated);
    
    setPasswordInput('');
    setEditingBank('');
    setSelectedBank('Shinhan Bank');
  };

  const handleDeletePassword = (bank: string) => {
    if (window.confirm(`Bạn có chắc chắn muốn xóa mật khẩu đã lưu của ngân hàng ${bank}?`)) {
      const updated = { ...passwords };
      delete updated[bank];
      saveBankPasswords(updated);
      setPasswords(updated);
      if (editingBank === bank) {
        setEditingBank('');
        setSelectedBank('Shinhan Bank');
        setPasswordInput('');
      }
    }
  };



  const handlePrivacyModeChange = (mode: 'temporary' | 'aggregate' | 'full') => {
    setPrivacyMode(mode);
    onUpdatePrivacyMode(mode);
  };


  const handleToggleArchive = (periodKey: string, shouldArchive: boolean) => {
    if (shouldArchive) {
      onUpdateArchivedPeriods([...archivedPeriods, periodKey]);
    } else {
      onUpdateArchivedPeriods(archivedPeriods.filter(p => p !== periodKey));
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1000 }}>
      <div 
        className="glass-card animate-fade-in" 
        style={{ 
          width: '95%', 
          maxWidth: '1000px', 
          height: '80vh', 
          maxHeight: '650px', 
          display: 'flex', 
          flexDirection: 'column', 
          padding: 0,
          overflow: 'hidden',
          backgroundColor: 'var(--surface-glass)',
          borderColor: 'var(--border-color)',
          boxShadow: 'var(--shadow-lg)'
        }}
      >
        {/* Modal Header */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          padding: '1.25rem 1.5rem', 
          borderBottom: '1px solid var(--border-color)' 
        }}>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: '800', margin: 0 }}>Cấu hình & Cài đặt</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>Thiết lập các tùy chọn phân loại, mật khẩu mở khóa và quản lý tệp tin.</p>
          </div>
          <button 
            className="btn btn-ghost" 
            onClick={onClose}
            style={{ padding: '0.4rem', borderRadius: '50%' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body Container */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          
          {/* Vertical Sidebar Tabs (Left) */}
          <div style={{ 
            width: '240px', 
            borderRight: '1px solid var(--border-color)', 
            backgroundColor: 'var(--bg-secondary)', 
            padding: '1.25rem 0.75rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
            overflowY: 'auto'
          }} className="scroller">
            <button 
              className={`tab-btn-v ${activeSettingTab === 'rules' ? 'active' : ''}`}
              onClick={() => setActiveSettingTab('rules')}
            >
              <BookOpen size={16} />
              <span>Quy tắc phân loại</span>
            </button>
            <button 
              className={`tab-btn-v ${activeSettingTab === 'categories' ? 'active' : ''}`}
              onClick={() => setActiveSettingTab('categories')}
            >
              <Tag size={16} />
              <span>Danh mục chi tiêu</span>
            </button>
            <button 
              className={`tab-btn-v ${activeSettingTab === 'passwords' ? 'active' : ''}`}
              onClick={() => setActiveSettingTab('passwords')}
            >
              <Lock size={16} />
              <span>Mật khẩu giải mã PDF</span>
            </button>
            <button 
              className={`tab-btn-v ${activeSettingTab === 'files' ? 'active' : ''}`}
              onClick={() => setActiveSettingTab('files')}
            >
              <Database size={16} />
              <span>Quản lý tệp sao kê</span>
            </button>
            <button 
              className={`tab-btn-v ${activeSettingTab === 'privacy' ? 'active' : ''}`}
              onClick={() => setActiveSettingTab('privacy')}
            >
              <Lock size={16} />
              <span>Lưu trữ & Bảo mật</span>
            </button>
            <button 
              className={`tab-btn-v ${activeSettingTab === 'archive' ? 'active' : ''}`}
              onClick={() => setActiveSettingTab('archive')}
            >
              <Archive size={16} />
              <span>Lưu trữ kỳ sao kê</span>
            </button>
          </div>

          {/* Settings Content Pane (Right) */}
          <div style={{ 
            flex: 1, 
            padding: '1.5rem', 
            overflowY: 'auto',
            backgroundColor: 'var(--surface-primary)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem'
          }} className="scroller">

            {/* TAB 1: RULES MANAGEMENT */}
            {activeSettingTab === 'rules' && (
              <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                  <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Quy tắc phân loại tự động</h3>
                  <button 
                    className="btn btn-secondary" 
                    style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
                    onClick={onApplyRulesToAll}
                  >
                    <RefreshCw size={12} /> Áp dụng ngay
                  </button>
                </div>

                <form onSubmit={handleAddRule} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', backgroundColor: 'var(--bg-secondary)', padding: '0.85rem', borderRadius: 'var(--border-radius-md)' }}>
                  <h4 style={{ fontSize: '0.85rem', margin: 0 }}>Thêm quy tắc mới</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '0.5rem' }}>
                    <input 
                      type="text" 
                      placeholder="Từ khóa (Ví dụ: grab, shopee, tiki...)" 
                      value={newKeyword}
                      onChange={(e) => setNewKeyword(e.target.value)}
                      style={{ fontSize: '0.85rem' }}
                      required
                    />
                    <select 
                      value={newRuleCategory} 
                      onChange={(e) => setNewRuleCategory(e.target.value)}
                      style={{ fontSize: '0.85rem' }}
                    >
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ padding: '0.5rem', fontSize: '0.85rem', alignSelf: 'flex-end' }}>
                    <Plus size={14} /> Thêm quy tắc
                  </button>
                </form>

                {rules.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    Chưa có quy tắc phân loại tự động nào.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {rules.map(r => {
                      const cat = categories.find(c => c.id === r.categoryId);
                      return (
                        <div 
                          key={r.id}
                          style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center', 
                            padding: '0.625rem 0.85rem', 
                            border: '1px solid var(--border-color)', 
                            borderRadius: 'var(--border-radius-md)',
                            backgroundColor: 'var(--bg-secondary)'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                            <BookOpen size={14} color="var(--text-tertiary)" />
                            <span>Nội dung chứa: <strong>"{r.keyword}"</strong></span>
                            <span style={{ color: 'var(--text-tertiary)' }}>➔</span>
                            {cat && (
                              <span className="badge" style={{ backgroundColor: `${cat.color}15`, color: cat.color }}>
                                {cat.name}
                              </span>
                            )}
                          </div>
                          <button 
                            className="btn btn-ghost"
                            style={{ padding: '0.2rem', color: 'var(--color-danger)' }}
                            onClick={() => handleDeleteRule(r.id)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: CATEGORIES MANAGEMENT */}
            {activeSettingTab === 'categories' && (
              <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                  <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Quản lý Danh mục Chi tiêu</h3>
                </div>

                <form onSubmit={handleAddCategory} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', backgroundColor: 'var(--bg-secondary)', padding: '0.85rem', borderRadius: 'var(--border-radius-md)' }}>
                  <h4 style={{ fontSize: '0.85rem', margin: 0 }}>Tạo danh mục tùy chỉnh mới</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.5rem' }}>
                    <input 
                      type="text" 
                      placeholder="Tên danh mục (Ví dụ: Thú cưng, Sức khỏe...)" 
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      style={{ fontSize: '0.85rem' }}
                      required
                    />
                    <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                      <input 
                        type="color" 
                        value={newCatColor}
                        onChange={(e) => setNewCatColor(e.target.value)}
                        style={{ padding: '0.1rem', cursor: 'pointer', height: '36px', width: '40px' }}
                        title="Chọn màu"
                      />
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Màu sắc</span>
                    </div>
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ padding: '0.5rem', fontSize: '0.85rem', alignSelf: 'flex-end' }}>
                    <Plus size={14} /> Tạo danh mục
                  </button>
                </form>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {categories.map(c => (
                    <div 
                      key={c.id}
                      style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        padding: '0.625rem 0.85rem', 
                        border: '1px solid var(--border-color)', 
                        borderRadius: 'var(--border-radius-md)',
                        backgroundColor: 'var(--bg-secondary)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                        <Tag size={14} color={c.color} />
                        <span style={{ fontWeight: '600' }}>{c.name}</span>
                        {c.isCustom ? (
                          <span className="badge badge-primary" style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem' }}>Tùy chỉnh</span>
                        ) : (
                          <span className="badge badge-secondary" style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem' }}>Mặc định</span>
                        )}
                      </div>
                      
                      {c.isCustom && (
                        <button 
                          className="btn btn-ghost"
                          style={{ padding: '0.2rem', color: 'var(--color-danger)' }}
                          onClick={() => handleDeleteCategory(c.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 3: SAVED PDF PASSWORDS */}
            {activeSettingTab === 'passwords' && (
              <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                  <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Mật khẩu giải mã PDF</h3>
                </div>

                <form onSubmit={handleSavePassword} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', backgroundColor: 'var(--bg-secondary)', padding: '0.85rem', borderRadius: 'var(--border-radius-md)' }}>
                  <h4 style={{ fontSize: '0.85rem', margin: 0 }}>{editingBank ? 'Cập nhật mật khẩu' : 'Thêm mật khẩu mới'}</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.5rem' }}>
                    <select 
                      value={selectedBank} 
                      onChange={(e) => setSelectedBank(e.target.value)}
                      style={{ fontSize: '0.85rem' }}
                      disabled={!!editingBank}
                    >
                      <option value="Shinhan Bank">Shinhan Bank</option>
                      <option value="Vietcombank">Vietcombank</option>
                      <option value="Techcombank">Techcombank</option>
                      <option value="MB Bank">MB Bank</option>
                      <option value="ACB">ACB</option>
                      <option value="VPBank">VPBank</option>
                      <option value="Sacombank">Sacombank</option>
                      <option value="VietinBank">VietinBank</option>
                      <option value="BIDV">BIDV</option>
                      <option value="TPBank">TPBank</option>
                      <option value="Generic">Ngân hàng khác</option>
                    </select>
                    <input 
                      type="text" 
                      placeholder="Nhập mật khẩu" 
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      style={{ fontSize: '0.85rem' }}
                      required
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                    {editingBank && (
                      <button 
                        type="button" 
                        className="btn btn-secondary" 
                        style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
                        onClick={() => {
                          setEditingBank('');
                          setSelectedBank('Shinhan Bank');
                          setPasswordInput('');
                        }}
                      >
                        Hủy
                      </button>
                    )}
                    <button type="submit" className="btn btn-primary" style={{ padding: '0.5rem', fontSize: '0.85rem' }}>
                      <Plus size={14} /> {editingBank ? 'Lưu thay đổi' : 'Thêm mật khẩu'}
                    </button>
                  </div>
                </form>

                {Object.keys(passwords).length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    Chưa có mật khẩu giải mã nào được lưu.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {Object.entries(passwords).map(([bank, pass]) => (
                      <div 
                        key={bank}
                        style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center', 
                          padding: '0.625rem 0.85rem', 
                          border: '1px solid var(--border-color)', 
                          borderRadius: 'var(--border-radius-md)',
                          backgroundColor: 'var(--bg-secondary)'
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                          <span style={{ fontWeight: '600', fontSize: '0.85rem' }}>{bank}</span>
                          <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {visibleBanks[bank] ? pass : '••••••••'}
                          </span>
                        </div>
                        
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          <button 
                            className="btn btn-ghost"
                            style={{ padding: '0.2rem', color: 'var(--text-secondary)' }}
                            onClick={() => setVisibleBanks(prev => ({ ...prev, [bank]: !prev[bank] }))}
                          >
                            {visibleBanks[bank] ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                          <button 
                            className="btn btn-ghost"
                            style={{ padding: '0.2rem', color: 'var(--text-secondary)' }}
                            onClick={() => {
                              setEditingBank(bank);
                              setSelectedBank(bank);
                              setPasswordInput(pass);
                            }}
                          >
                            <Edit size={14} />
                          </button>
                          <button 
                            className="btn btn-ghost"
                            style={{ padding: '0.2rem', color: 'var(--color-danger)' }}
                            onClick={() => handleDeletePassword(bank)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}



            {/* TAB 5: MANAGED STATEMENT FILES */}
            {activeSettingTab === 'files' && (
              <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                  <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Quản lý tệp sao kê ({statementFiles.length})</h3>
                </div>

                {isRebuilding && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-primary)', fontSize: '0.9rem', padding: '0.5rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--border-radius-sm)' }}>
                    <Loader2 className="animate-spin" size={16} />
                    <span>Đang nạp và phân tích lại các tệp sao kê...</span>
                  </div>
                )}

                {statementFiles.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    Chưa tải lên tệp sao kê nào.
                  </div>
                ) : (
                  <div className="table-container scroller" style={{ maxHeight: '380px', overflowY: 'auto' }}>
                    <table className="table-el" style={{ fontSize: '0.85rem' }}>
                      <thead>
                        <tr>
                          <th>Tên tệp tin</th>
                          <th>Ngân hàng</th>
                          <th>Nguồn nhận</th>
                          <th>Kích thước</th>
                          <th>Ngày nhập</th>
                          <th style={{ width: '80px', textAlign: 'center' }}>Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statementFiles.map((sf) => (
                          <tr key={sf.id}>
                            <td style={{ fontWeight: '600' }}>{sf.name}</td>
                            <td>{sf.bank}</td>
                            <td>
                              {sf.sourceType === 'drive' ? (
                                <span className="badge" style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                  <Database size={10} /> Google Drive
                                </span>
                              ) : (
                                <span className="badge" style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                  <UploadCloud size={10} /> Máy tính
                                </span>
                              )}
                            </td>
                            <td style={{ color: 'var(--text-secondary)' }}>
                              {(sf.size / 1024).toFixed(1)} KB
                            </td>
                            <td style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                              {new Date(sf.importedAt).toLocaleDateString('vi-VN')} {new Date(sf.importedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <div style={{ display: 'flex', justifyContent: 'center', gap: '0.25rem' }}>
                                <button 
                                  className="btn btn-ghost" 
                                  style={{ padding: '0.2rem', color: 'var(--text-secondary)' }}
                                  onClick={() => onRenameStatement(sf.id, sf.name)}
                                  title="Đổi tên"
                                >
                                  <Edit size={14} />
                                </button>
                                <button 
                                  className="btn btn-ghost" 
                                  style={{ padding: '0.2rem', color: 'var(--color-danger)' }}
                                  onClick={() => onDeleteStatement(sf.id, sf.name)}
                                  title="Xóa tệp"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TAB 6: PRIVACY & STORAGE SETTINGS */}
            {activeSettingTab === 'privacy' && (
              <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                  <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Cấu hình Lưu trữ & Bảo mật</h3>
                </div>

                <div style={{ backgroundColor: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--border-radius-md)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <h4 style={{ fontSize: '0.9rem', margin: 0, color: 'var(--text-primary)' }}>Chế độ Lưu trữ dữ liệu</h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                    Chọn cách thức BST Manager lưu trữ tệp sao kê và dữ liệu chi tiêu trên máy tính của bạn:
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                    <label style={{ display: 'flex', alignItems: 'start', gap: '0.75rem', cursor: 'pointer', padding: '0.75rem', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius-md)', backgroundColor: privacyMode === 'full' ? 'rgba(99, 102, 241, 0.05)' : 'var(--surface-primary)' }}>
                      <input 
                        type="radio" 
                        name="privacyMode" 
                        value="full" 
                        checked={privacyMode === 'full'} 
                        onChange={() => handlePrivacyModeChange('full')} 
                        style={{ width: 'auto', margin: 0, marginTop: '0.2rem', flexShrink: 0 }}
                      />
                      <div>
                        <strong style={{ display: 'block', fontSize: '0.85rem' }}>Lưu trữ toàn bộ (Thuận tiện nhất)</strong>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          Lưu trữ tệp PDF gốc, mật khẩu giải mã và danh sách chi tiết các giao dịch. Lần sau tải lại trang, hệ thống sẽ tự động phân tích và nạp lại toàn bộ dữ liệu.
                        </span>
                      </div>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'start', gap: '0.75rem', cursor: 'pointer', padding: '0.75rem', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius-md)', backgroundColor: privacyMode === 'aggregate' ? 'rgba(99, 102, 241, 0.05)' : 'var(--surface-primary)' }}>
                      <input 
                        type="radio" 
                        name="privacyMode" 
                        value="aggregate" 
                        checked={privacyMode === 'aggregate'} 
                        onChange={() => handlePrivacyModeChange('aggregate')} 
                        style={{ width: 'auto', margin: 0, marginTop: '0.2rem', flexShrink: 0 }}
                      />
                      <div>
                        <strong style={{ display: 'block', fontSize: '0.85rem' }}>Chỉ lưu số liệu tổng hợp (An toàn & Bảo mật)</strong>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          Chỉ lưu trữ các con số tổng cộng cần thiết cho Dashboard (tổng chi, tổng tiền hoàn, phân bổ danh mục). Tệp PDF gốc, mật khẩu mở và các thông tin giao dịch nhạy cảm (như ngày giờ, tên cửa hàng/merchant chi tiết) hoàn toàn KHÔNG được lưu trên thiết bị của bạn.
                        </span>
                      </div>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'start', gap: '0.75rem', cursor: 'pointer', padding: '0.75rem', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius-md)', backgroundColor: privacyMode === 'temporary' ? 'rgba(99, 102, 241, 0.05)' : 'var(--surface-primary)' }}>
                      <input 
                        type="radio" 
                        name="privacyMode" 
                        value="temporary" 
                        checked={privacyMode === 'temporary'} 
                        onChange={() => handlePrivacyModeChange('temporary')} 
                        style={{ width: 'auto', margin: 0, marginTop: '0.2rem', flexShrink: 0 }}
                      />
                      <div>
                        <strong style={{ display: 'block', fontSize: '0.85rem' }}>Chế độ Riêng tư Cao (Tạm thời)</strong>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          Dữ liệu chỉ được giữ tạm thời trên bộ nhớ RAM. Khi bạn đóng tab hoặc tải lại trang (F5), mọi tệp sao kê, mật khẩu và giao dịch sẽ biến mất hoàn toàn và không để lại dấu vết gì.
                        </span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Cloud Sync Option */}
                <div style={{ backgroundColor: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--border-radius-md)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <h4 style={{ fontSize: '0.9rem', margin: 0, color: 'var(--text-primary)' }}>Đồng bộ hóa đám mây (Cloud Sync)</h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                    Tự động đồng bộ các giao dịch, quy tắc phân loại và danh mục trên tất cả các trình duyệt và thiết bị của bạn thông qua Google Drive:
                  </p>
                  
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: '600', padding: '0.5rem 0' }}>
                    <input 
                      type="checkbox" 
                      checked={cloudSyncEnabled}
                      onChange={(e) => {
                        const val = e.target.checked;
                        setCloudSyncEnabled(val);
                        onUpdateCloudSync(val);
                      }}
                      style={{ width: 'auto', margin: 0, cursor: 'pointer' }}
                    />
                    Kích hoạt đồng bộ hóa đám mây
                  </label>

                  {cloudSyncEnabled && (
                    <div style={{ padding: '0.75rem', backgroundColor: 'rgba(245, 158, 11, 0.1)', borderLeft: '4px solid var(--color-warning)', color: 'var(--text-primary)', fontSize: '0.75rem', borderRadius: 'var(--border-radius-sm)' }}>
                      <strong>⚠️ LƯU Ý QUAN TRỌNG:</strong> Không được xóa hoặc sửa đổi tệp tin <code>bst_sync_data.json</code> được tạo tự động trên Google Drive của bạn. Việc xóa tệp tin này sẽ làm mất toàn bộ dữ liệu cần thiết để đồng bộ giữa các thiết bị!
                    </div>
                  )}
                </div>

                {/* Clear All Data Option */}
                <div style={{ backgroundColor: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--border-radius-md)', display: 'flex', flexDirection: 'column', gap: '0.75rem', border: '1px solid var(--border-color)' }}>
                  <h4 style={{ fontSize: '0.9rem', margin: 0, color: 'var(--color-danger)' }}>Xóa dữ liệu ứng dụng</h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                    Xóa sạch toàn bộ dữ liệu giao dịch, danh mục chi tiêu, quy tắc phân loại và thông tin liên kết tài khoản đã lưu trên trình duyệt này. Hành động này không thể hoàn tác.
                  </p>
                  <div>
                    <button 
                      className="btn" 
                      onClick={() => {
                        if (confirm('Bạn có chắc chắn muốn xóa toàn bộ dữ liệu ứng dụng? Hành động này không thể khôi phục.')) {
                          onResetAllData();
                          onClose();
                        }
                      }}
                      style={{ backgroundColor: 'var(--color-danger)', color: 'white', border: 'none', padding: '0.5rem 1.25rem', fontSize: '0.85rem' }}
                    >
                      Xóa toàn bộ dữ liệu của tôi
                    </button>
                  </div>
                </div>

                <div style={{ padding: '1rem', border: '1px dashed var(--border-color)', borderRadius: 'var(--border-radius-md)', backgroundColor: 'rgba(239, 68, 68, 0.05)', color: 'var(--color-danger)' }}>
                  <h4 style={{ fontSize: '0.85rem', margin: '0 0 0.5rem 0', fontWeight: 'bold' }}>⚠️ Cam kết Bảo mật & Quyền riêng tư:</h4>
                  <ul style={{ fontSize: '0.75rem', margin: 0, paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', lineHeight: '1.5' }}>
                    <li>Ứng dụng hoạt động **hoàn toàn trực tiếp trên trình duyệt của bạn**. Không có bất kỳ thông tin tài chính, mật khẩu hay tệp sao kê nào được gửi lên mạng hoặc lưu trên máy chủ của bên thứ ba.</li>
                    <li>Các thông tin cá nhân của bạn (như mật khẩu mở file PDF, tên cửa hàng mua sắm, số tiền chi tiêu) được lưu an toàn ngay trên máy tính/điện thoại cá nhân của bạn và sẽ được xóa bỏ ngay lập tức nếu bạn thay đổi chế độ lưu trữ hoặc xóa dữ liệu trang web.</li>
                  </ul>
                </div>
              </div>
            )}

            {activeSettingTab === 'archive' && (
              <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
                  <h3 style={{ fontSize: '1.1rem', margin: '0 0 0.25rem 0' }}>Lưu trữ Kỳ sao kê</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                    Lưu trữ các kỳ sao kê cũ giúp ẩn bớt các giao dịch của kỳ đó trong các chế độ xem tổng hợp, giúp bạn tập trung vào kỳ mới.
                  </p>
                </div>

                <div style={{
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--border-radius-md)',
                  overflow: 'hidden'
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                        <th style={{ padding: '0.75rem 1rem' }}>Kỳ sao kê</th>
                        <th style={{ padding: '0.75rem 1rem' }}>Trạng thái</th>
                        <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statementPeriods.length === 0 ? (
                        <tr>
                          <td colSpan={3} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                            Chưa phát hiện kỳ sao kê nào từ dữ liệu.
                          </td>
                        </tr>
                      ) : (
                        statementPeriods.map(p => {
                          const isArchived = archivedPeriods.includes(p.key);
                          return (
                            <tr key={p.key} style={{ borderBottom: '1px solid var(--border-color)' }}>
                              <td style={{ padding: '0.75rem 1rem', fontWeight: '600' }}>{p.label}</td>
                              <td style={{ padding: '0.75rem 1rem' }}>
                                {isArchived ? (
                                  <span className="badge badge-warning" style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', color: 'var(--color-warning)' }}>Đã lưu trữ</span>
                                ) : (
                                  <span className="badge badge-success" style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: 'var(--color-success)' }}>Đang hoạt động</span>
                                )}
                              </td>
                              <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                                {isArchived ? (
                                  <button
                                    className="btn btn-secondary"
                                    style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                                    onClick={() => handleToggleArchive(p.key, false)}
                                  >
                                    Mở lưu trữ
                                  </button>
                                ) : (
                                  <button
                                    className="btn btn-primary"
                                    style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', backgroundColor: 'var(--color-primary)', color: 'white', border: 'none' }}
                                    onClick={() => handleToggleArchive(p.key, true)}
                                  >
                                    Lưu trữ
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>

        </div>

      </div>
    </div>
  );
};
