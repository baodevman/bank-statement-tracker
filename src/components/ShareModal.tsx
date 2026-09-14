import React, { useState } from 'react';
import { Share2, Lock, Clock, Copy, Check, ShieldCheck, X } from 'lucide-react';
import type { Transaction, Group } from '../utils/db';
import { createShareLink, type SharePayload } from '../utils/shareService';

interface ShareModalProps {
  transactions: Transaction[];
  groups: Group[];
  selectedStatement: string;
  onClose: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  transactions,
  groups,
  selectedStatement,
  onClose,
}) => {
  // Available groups for table selection
  const availableGroups = [
    { id: 'personal', name: 'Cá nhân' },
    { id: 'personal_exclude', name: 'Mua hộ tự do' },
    ...groups.map(g => ({ id: g.id, name: g.name }))
  ];

  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(availableGroups.map(g => g.id));
  const [password, setPassword] = useState<string>('');
  const [expiryOption, setExpiryOption] = useState<number>(10 * 60 * 1000); // Default 10 min in ms
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generatedUrl, setGeneratedUrl] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  const handleToggleGroup = (groupId: string) => {
    setSelectedGroupIds(prev =>
      prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId]
    );
  };

  const handleSelectAllGroups = () => {
    if (selectedGroupIds.length === availableGroups.length) {
      setSelectedGroupIds([]);
    } else {
      setSelectedGroupIds(availableGroups.map(g => g.id));
    }
  };

  const handleGenerateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedGroupIds.length === 0) {
      alert('Vui lòng chọn ít nhất 1 bảng nhóm giao dịch để chia sẻ.');
      return;
    }

    setIsGenerating(true);
    setGeneratedUrl('');

    try {
      // Filter transactions matching selected groups
      const tableGroups: SharePayload['tableGroups'] = [];

      availableGroups.forEach(grp => {
        if (!selectedGroupIds.includes(grp.id)) return;

        let txs: Transaction[] = [];
        if (grp.id === 'personal') {
          txs = transactions.filter(t => !t.groupId && !t.excludeFromPersonal && !t.isHidden);
        } else if (grp.id === 'personal_exclude') {
          txs = transactions.filter(t => !t.groupId && t.excludeFromPersonal && !t.isHidden);
        } else {
          txs = transactions.filter(t => t.groupId === grp.id && !t.isHidden);
        }

        if (txs.length > 0) {
          tableGroups.push({
            groupId: grp.id,
            groupName: grp.name,
            transactions: txs,
          });
        }
      });

      const payload: SharePayload = {
        version: 1,
        title: `Báo cáo sao kê - ${selectedStatement === 'all' ? 'Tất cả các tháng' : selectedStatement}`,
        createdAt: Date.now(),
        expiresAt: Date.now() + expiryOption,
        hasPassword: password.trim().length > 0,
        tableGroups,
      };

      const res = await createShareLink(payload, password.trim() || undefined);
      setGeneratedUrl(res.shareUrl);
    } catch (err: any) {
      alert('Lỗi tạo link chia sẻ: ' + (err.message || err));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!generatedUrl) return;
    try {
      await navigator.clipboard.writeText(generatedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      alert('Không thể sao chép tự động. Vui lòng tô đen và bôi đen link bên dưới để chép.');
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1300 }}>
      <div className="modal-content animate-fade-in" style={{ maxWidth: '520px', width: '90%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-primary)' }}>
            <Share2 size={20} /> Tạo Link Chia Sẻ Bảo Mật
          </h3>
          <button className="btn btn-ghost" onClick={onClose} style={{ padding: '0.25rem', fontSize: '1.25rem', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleGenerateLink} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Section 1: Table Group Selection */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontWeight: '600', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                a. Chọn bảng nhóm muốn chia sẻ:
              </label>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleSelectAllGroups}
                style={{ fontSize: '0.75rem', color: 'var(--color-primary)', padding: '0.1rem 0.4rem' }}
              >
                {selectedGroupIds.length === availableGroups.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', backgroundColor: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--border-color)' }}>
              {availableGroups.map(grp => (
                <label key={grp.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.825rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selectedGroupIds.includes(grp.id)}
                    onChange={() => handleToggleGroup(grp.id)}
                    style={{ width: 'auto' }}
                  />
                  <span>{grp.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Section 2: Password Protection */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label style={{ fontWeight: '600', fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Lock size={15} /> b. Đặt mật khẩu truy cập (Tùy chọn):
            </label>
            <input
              type="password"
              placeholder="Để trống nếu không muốn đặt mật khẩu..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: '100%' }}
            />
            <span style={{ fontSize: '0.725rem', color: 'var(--text-tertiary)' }}>
              *Dữ liệu sẽ được mã hóa AES-256 mã hóa bằng mật khẩu này trước khi chia sẻ.
            </span>
          </div>

          {/* Section 3: Expiration Selection */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label style={{ fontWeight: '600', fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Clock size={15} /> c. Thời gian khả dụng (Tự động xóa link):
            </label>
            <select
              value={expiryOption}
              onChange={(e) => setExpiryOption(Number(e.target.value))}
              style={{ width: '100%', fontWeight: '600' }}
            >
              <option value={10 * 60 * 1000}>10 phút (Khuyến nghị cho trao đổi nhanh)</option>
              <option value={60 * 60 * 1000}>1 giờ</option>
              <option value={24 * 60 * 60 * 1000}>1 ngày</option>
              <option value={7 * 24 * 60 * 60 * 1000}>7 ngày</option>
            </select>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isGenerating}
            style={{ padding: '0.65rem 1rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginTop: '0.5rem' }}
          >
            <ShieldCheck size={18} /> {isGenerating ? 'Đang tạo link mã hóa...' : 'Tạo Link Chia Sẻ Ngay'}
          </button>
        </form>

        {/* Generated Link Display Box */}
        {generatedUrl && (
          <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              Đã tạo thành công Link Chia Sẻ!
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                readOnly
                value={generatedUrl}
                style={{ flex: 1, fontSize: '0.8rem', backgroundColor: 'var(--bg-secondary)', fontWeight: 'bold' }}
              />
              <button
                className={`btn ${copied ? 'btn-success' : 'btn-primary'}`}
                onClick={handleCopy}
                style={{ padding: '0.5rem 0.85rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
                <span>{copied ? 'Đã chép!' : 'Sao chép'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
