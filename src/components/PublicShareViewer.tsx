import React, { useState, useEffect, useMemo } from 'react';
import { ShieldCheck, Lock, Search, AlertTriangle, ArrowLeft } from 'lucide-react';
import { fetchShareData, decryptPayload, type SharePayload } from '../utils/shareService';

interface PublicShareViewerProps {
  shareIdOrHash: string;
  onExit: () => void;
}

export const PublicShareViewer: React.FC<PublicShareViewerProps> = ({
  shareIdOrHash,
  onExit,
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [encryptedData, setEncryptedData] = useState<string | null>(null);
  const [requiresPassword, setRequiresPassword] = useState<boolean>(false);
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [payload, setPayload] = useState<SharePayload | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');

  useEffect(() => {
    async function loadShare() {
      setLoading(true);
      setErrorMessage(null);

      try {
        const result = await fetchShareData(shareIdOrHash);
        setEncryptedData(result.encryptedPayload);

        if (result.encryptedPayload.startsWith('ENC:')) {
          setRequiresPassword(true);
          setLoading(false);
        } else {
          // Unencrypted
          const jsonStr = await decryptPayload(result.encryptedPayload);
          const parsedPayload = JSON.parse(jsonStr) as SharePayload;

          if (parsedPayload.expiresAt && Date.now() > parsedPayload.expiresAt) {
            setErrorMessage('Link chia sẻ này đã hết hạn khả dụng.');
          } else {
            setPayload(parsedPayload);
          }
          setLoading(false);
        }
      } catch (err: any) {
        if (err.message === 'EXPIRED_OR_NOT_FOUND') {
          setErrorMessage('Link chia sẻ này đã hết hạn khả dụng hoặc không tồn tại.');
        } else {
          setErrorMessage('Không thể tải nội dung chia sẻ: ' + err.message);
        }
        setLoading(false);
      }
    }

    loadShare();
  }, [shareIdOrHash]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!encryptedData || !passwordInput) return;

    setLoading(true);
    setErrorMessage(null);

    try {
      const jsonStr = await decryptPayload(encryptedData, passwordInput.trim());
      const parsedPayload = JSON.parse(jsonStr) as SharePayload;

      if (parsedPayload.expiresAt && Date.now() > parsedPayload.expiresAt) {
        setErrorMessage('Link chia sẻ này đã hết hạn khả dụng.');
      } else {
        setPayload(parsedPayload);
        setRequiresPassword(false);
      }
    } catch (err: any) {
      if (err.message === 'INCORRECT_PASSWORD') {
        setErrorMessage('Mật khẩu không chính xác. Vui lòng thử lại.');
      } else {
        setErrorMessage('Giải mã thất bại: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const formatDateDisplay = (dateStr: string): string => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    return dateStr;
  };

  const remainingTimeString = useMemo(() => {
    if (!payload?.expiresAt) return null;
    const diff = payload.expiresAt - Date.now();
    if (diff <= 0) return 'Đã hết hạn';
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes} phút nữa`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} giờ nữa`;
    const days = Math.floor(hours / 24);
    return `${days} ngày nữa`;
  }, [payload]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: '1rem' }}>
        <div className="skeleton-line" style={{ width: '48px', height: '48px', borderRadius: '50%' }}></div>
        <p style={{ color: 'var(--text-secondary)' }}>Đang xác thực và tải dữ liệu báo cáo chia sẻ...</p>
      </div>
    );
  }

  if (errorMessage && !requiresPassword) {
    return (
      <div className="glass-card animate-fade-in" style={{ maxWidth: '500px', margin: '3rem auto', textAlign: 'center', padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
        <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--color-danger)', padding: '1rem', borderRadius: '50%' }}>
          <AlertTriangle size={32} />
        </div>
        <h3 style={{ margin: 0 }}>Link Chia Sẻ Không Khả Dụng</h3>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{errorMessage}</p>
        <button className="btn btn-primary" onClick={onExit} style={{ marginTop: '0.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
          <ArrowLeft size={16} /> Quay về Ứng Dụng
        </button>
      </div>
    );
  }

  if (requiresPassword && !payload) {
    return (
      <div className="modal-overlay">
        <div className="modal-content animate-fade-in" style={{ maxWidth: '420px', width: '90%' }}>
          <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
            <div style={{ backgroundColor: 'rgba(99, 102, 241, 0.1)', color: 'var(--color-primary)', width: '56px', height: '56px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
              <Lock size={28} />
            </div>
            <h3 style={{ margin: 0 }}>Nhập Mật Khẩu Xem Báo Cáo</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
              Báo cáo này được bảo vệ bằng mật khẩu mã hóa.
            </p>
          </div>

          <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input
              type="password"
              placeholder="Nhập mật khẩu..."
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              required
              autoFocus
              style={{ width: '100%', padding: '0.65rem' }}
            />

            {errorMessage && (
              <p style={{ color: 'var(--color-danger)', fontSize: '0.8rem', margin: 0, textAlign: 'center' }}>
                {errorMessage}
              </p>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button type="button" className="btn btn-secondary" onClick={onExit}>Thoát</button>
              <button type="submit" className="btn btn-primary">Mở Báo Cáo</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  if (!payload) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1400px', margin: '0 auto', width: '98%' }} className="animate-fade-in">
      {/* Header Bar */}
      <div className="glass-card" style={{ padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderLeft: '5px solid var(--color-success)' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldCheck color="var(--color-success)" size={22} /> {payload.title}
          </h2>
          <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            <span>🕒 Tạo lúc: {new Date(payload.createdAt).toLocaleString('vi-VN')}</span>
            {remainingTimeString && (
              <span style={{ color: 'var(--color-warning)', fontWeight: 'bold' }}>
                ⏳ Tự hủy sau: {remainingTimeString}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <div style={{ position: 'relative', minWidth: '220px' }}>
            <Search size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-tertiary)' }} />
            <input
              type="text"
              placeholder="Tìm kiếm giao dịch..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '2.25rem', fontSize: '0.825rem' }}
            />
          </div>
          <button className="btn btn-secondary" onClick={onExit} style={{ fontSize: '0.825rem', gap: '0.35rem' }}>
            <ArrowLeft size={15} /> Báo cáo gốc
          </button>
        </div>
      </div>

      {/* Shared Group Tables */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {payload.tableGroups.map((groupTable) => {
          const filteredTxs = groupTable.transactions.filter(t =>
            !searchTerm || t.description.toLowerCase().includes(searchTerm.toLowerCase().trim())
          );

          // Calculate subtotal for this shared group table
          let netDebt = 0;
          filteredTxs.forEach(t => {
            const isRefund = t.isRefund || t.amount > 0;
            const absVal = Math.abs(t.amount);
            netDebt += isRefund ? -absVal : absVal;
          });

          return (
            <div key={groupTable.groupId || groupTable.groupName} className="glass-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--color-primary)' }}>
                    📊 Bảng: {groupTable.groupName}
                  </h3>
                  <span className="badge" style={{ backgroundColor: 'rgba(99, 102, 241, 0.12)', color: 'var(--color-primary)', fontSize: '0.75rem' }}>
                    {filteredTxs.length} giao dịch
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Tổng dư nợ bảng này:</span>
                  <strong style={{ fontSize: '1.05rem', color: netDebt >= 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                    {netDebt.toLocaleString('vi-VN')} VND
                  </strong>
                </div>
              </div>

              <div className="table-container" style={{ maxHeight: '450px', overflow: 'auto' }}>
                <table className="table-el">
                  <thead style={{ position: 'sticky', top: 0, zIndex: 5, backgroundColor: 'var(--bg-card)' }}>
                    <tr>
                      <th style={{ width: '100px' }}>Ngày</th>
                      <th style={{ width: '110px' }}>Ngân hàng</th>
                      <th>Nội dung giao dịch</th>
                      <th style={{ textAlign: 'right', width: '150px' }}>Số tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTxs.map((tx) => (
                      <tr key={tx.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{formatDateDisplay(tx.date)}</td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{tx.bank}</td>
                        <td style={{ fontWeight: '500' }}>{tx.description}</td>
                        <td style={{
                          textAlign: 'right',
                          fontWeight: '700',
                          color: (tx.isRefund || tx.amount > 0) ? 'var(--color-success)' : 'var(--color-danger)',
                          whiteSpace: 'nowrap'
                        }}>
                          {tx.isRefund ? (
                            <span>+{Math.abs(tx.amount).toLocaleString('vi-VN')} VND</span>
                          ) : (
                            <>{tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString('vi-VN')} VND</>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
