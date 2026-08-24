import React, { useMemo } from 'react';
import html2canvas from 'html2canvas';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingDown, Wallet, Users, Printer, Share2 } from 'lucide-react';
import type { Transaction, Category, Group, SavedStatement } from '../utils/db';

interface DashboardProps {
  transactions: Transaction[];
  categories: Category[];
  groups: Group[];
  selectedStatement: string;
  setSelectedStatement: (val: string) => void;
  statementFiles: SavedStatement[];
  statementPeriods: { key: string; label: string }[];
}

export const Dashboard: React.FC<DashboardProps> = ({
  transactions,
  categories,
  groups,
  selectedStatement,
  setSelectedStatement,
  statementFiles,
  statementPeriods,
}) => {

  // Filter transactions by statement (transactions are already filtered centrally)
  const filteredTransactions = transactions;

  // Calculate statistics
  const stats = useMemo(() => {
    let totalIncome = 0;
    let totalPersonalExpense = 0;
    let totalGroupExpense = 0;

    filteredTransactions.forEach(t => {
      if (t.amount > 0) {
        totalIncome += t.amount;
      } else {
        const absVal = Math.abs(t.amount);
        if (t.excludeFromPersonal || t.groupId) {
          totalGroupExpense += absVal;
        } else {
          totalPersonalExpense += absVal;
        }
      }
    });

    return {
      totalIncome,
      totalPersonalExpense,
      totalGroupExpense,
      netSavings: totalIncome - totalPersonalExpense,
    };
  }, [filteredTransactions]);

  const benefitsValue = useMemo(() => {
    if (selectedStatement === 'all') {
      return statementFiles.reduce((sum, f) => sum + (f.availableBenefits || 0), 0);
    } else {
      const match = statementFiles.find(f => f.name === selectedStatement);
      return match ? (match.thisMonthBenefits || 0) : 0;
    }
  }, [selectedStatement, statementFiles]);

  // Data for Expenses by Category Chart
  const categoryChartData = useMemo(() => {
    const expenseMap: Record<string, number> = {};
    
    // Initialize with 0
    categories.forEach(c => {
      if (c.id !== 'income') {
        expenseMap[c.id] = 0;
      }
    });

    filteredTransactions.forEach(t => {
      // Only include personal expenses
      if (t.amount < 0 && !t.excludeFromPersonal && !t.groupId) {
        const catId = t.category || 'others';
        expenseMap[catId] = (expenseMap[catId] || 0) + Math.abs(t.amount);
      }
    });

    return Object.entries(expenseMap)
      .map(([id, value]) => {
        const cat = categories.find(c => c.id === id);
        return {
          id,
          name: cat ? cat.name : 'Khác',
          value,
          color: cat ? cat.color : '#94a3b8',
        };
      })
      .filter(item => item.value > 0);
  }, [filteredTransactions, categories]);

  // Data for Expenses by Group Chart
  const groupChartData = useMemo(() => {
    const groupMap: Record<string, number> = {};
    
    // Initialize with 0
    groups.forEach(g => {
      groupMap[g.id] = 0;
    });
    let ungroupedExclude = 0;

    filteredTransactions.forEach(t => {
      if (t.amount < 0) {
        if (t.groupId) {
          groupMap[t.groupId] = (groupMap[t.groupId] || 0) + Math.abs(t.amount);
        } else if (t.excludeFromPersonal) {
          ungroupedExclude += Math.abs(t.amount);
        }
      }
    });

    const data = Object.entries(groupMap)
      .map(([id, value]) => {
        const g = groups.find(group => group.id === id);
        return {
          id,
          name: g ? g.name : 'Khác',
          value,
          color: '#6366f1',
        };
      })
      .filter(item => item.value > 0);

    if (ungroupedExclude > 0) {
      data.push({
        id: 'ungrouped',
        name: 'Mua hộ tự do',
        value: ungroupedExclude,
        color: '#a5b4fc',
      });
    }

    if (stats.totalPersonalExpense > 0) {
      data.unshift({
        id: 'personal',
        name: 'Cá nhân',
        value: stats.totalPersonalExpense,
        color: '#475569',
      });
    }

    // Assign a palette of nice colors to the groups
    const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#10b981', '#f59e0b', '#3b82f6'];
    return data.map((item, index) => ({
      ...item,
      color: item.id === 'personal' ? '#475569' : (item.id === 'ungrouped' ? '#94a3b8' : COLORS[index % COLORS.length])
    }));
  }, [filteredTransactions, groups, stats]);

  // Data for Historical Spending vs Benefits Chart (grouped by statement)
  const historyChartData = useMemo(() => {
    const statements = Array.from(new Set(transactions.map(t => t.statementId))).sort();
    
    return statements.map(stmt => {
      let personalExpense = 0;
      let groupExpense = 0;

      transactions.filter(t => t.statementId === stmt).forEach(t => {
        const absVal = Math.abs(t.amount);
        if (t.excludeFromPersonal || t.groupId) {
          groupExpense += absVal;
        } else {
          personalExpense += absVal;
        }
      });

      // Find monthly benefits from statementFiles
      const match = statementFiles.find(f => f.name === stmt);
      const monthlyBenefit = match ? (match.thisMonthBenefits || 0) : 0;

      // Truncate long filename for display
      const displayName = stmt.length > 20 ? stmt.substring(0, 17) + '...' : stmt;

      return {
        name: displayName,
        fullStatementId: stmt,
        'Chi tiêu cá nhân': personalExpense,
        'Chi tiêu mua hộ/nhóm': groupExpense,
        'Ưu đãi tích lũy': monthlyBenefit,
      };
    });
  }, [transactions, statementFiles]);

  // Export and Share Helpers for Dashboard
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

  const dashboardSummaryText = useMemo(() => {
    return `📊 BÁO CÁO TỔNG QUAN BST
Kỳ sao kê: ${selectedStatement === 'all' ? 'Tất cả các tháng' : selectedStatement}
- Chi tiêu cá nhân: ${stats.totalPersonalExpense.toLocaleString('vi-VN')} VND
- Mua hộ / Nhóm: ${stats.totalGroupExpense.toLocaleString('vi-VN')} VND
- Tích lũy ưu đãi: ${benefitsValue.toLocaleString('vi-VN')} VND`;
  }, [selectedStatement, stats, benefitsValue]);

  // Custom tooltips for Recharts
  const formatCurrency = (value: number) => `${value.toLocaleString('vi-VN')} VND`;

  return (
    <div id="dashboard-capture-area" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} className="animate-fade-in">
      
      {/* Export & Share Header (hidden when printing) */}
      <div className="print-hide" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <h2 style={{ margin: 0 }}>Dashboard Phân Tích</h2>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem', gap: '0.35rem' }} onClick={handleExportPDF}>
            <Printer size={14} /> In / Xuất PDF
          </button>
          <button className="btn btn-primary" style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem', gap: '0.35rem' }} onClick={() => handleShareReport('dashboard-capture-area', dashboardSummaryText)}>
            <Share2 size={14} /> Chia sẻ (Zalo/Bluetooth)
          </button>
        </div>
      </div>

      {/* Statement Selector Card (hidden when printing) */}
      <div className="glass-card print-hide" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', padding: '1rem 1.25rem' }}>
        <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Lọc dữ liệu theo kỳ sao kê</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Kỳ sao kê:</span>
          <select 
            value={selectedStatement} 
            onChange={(e) => setSelectedStatement(e.target.value)}
            style={{ width: 'auto', minWidth: '200px' }}
          >
            <option value="all">Tất cả các tháng ({statementPeriods.length})</option>
            {statementPeriods.map((p, idx) => (
              <option key={idx} value={p.key}>{p.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', 
        gap: '1.25rem' 
      }}>
        
        {/* Personal Expense Card */}
        <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '5px solid var(--color-danger)' }}>
          <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem', borderRadius: 'var(--border-radius-md)', color: 'var(--color-danger)' }}>
            <TrendingDown size={24} />
          </div>
          <div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: '500' }}>Chi tiêu cá nhân</p>
            <h3 style={{ color: 'var(--color-danger)', marginTop: '0.25rem' }}>{formatCurrency(stats.totalPersonalExpense)}</h3>
          </div>
        </div>

        {/* Group / Buying Help Card */}
        <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '5px solid var(--color-primary)' }}>
          <div style={{ backgroundColor: 'rgba(99, 102, 241, 0.1)', padding: '0.75rem', borderRadius: 'var(--border-radius-md)', color: 'var(--color-primary)' }}>
            <Users size={24} />
          </div>
          <div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: '500' }}>Mua hộ / Chi tiêu nhóm</p>
            <h3 style={{ color: 'var(--color-primary)', marginTop: '0.25rem' }}>{formatCurrency(stats.totalGroupExpense)}</h3>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>*Được loại khỏi tổng chi tiêu cá nhân</span>
          </div>
        </div>

        {/* Cashback & Benefits Card */}
        <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '5px solid var(--color-success)' }}>
          <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '0.75rem', borderRadius: 'var(--border-radius-md)', color: 'var(--color-success)' }}>
            <Wallet size={24} />
          </div>
          <div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: '500' }}>
              {selectedStatement === 'all' ? 'Ưu đãi tích lũy hiện có' : 'Ưu đãi tích lũy tháng này'}
            </p>
            <h3 style={{ color: 'var(--color-success)', marginTop: '0.25rem' }}>{formatCurrency(benefitsValue)}</h3>
          </div>
        </div>

      </div>

      {/* Group Breakdown Cards */}
      {groups.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }} className="animate-fade-in">
          <h4 style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)' }}>👥 Chi tiết theo Nhóm chi tiêu</h4>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', 
            gap: '1rem' 
          }}>
            {groups.map(g => {
              let groupTotal = 0;
              filteredTransactions.forEach(t => {
                if (t.groupId === g.id && t.amount < 0) {
                  groupTotal += Math.abs(t.amount);
                }
              });
              
              return (
                <div className="glass-card" key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderLeft: '4px solid var(--color-primary)' }}>
                  <div style={{ backgroundColor: 'rgba(99, 102, 241, 0.1)', padding: '0.5rem', borderRadius: 'var(--border-radius-sm)', color: 'var(--color-primary)' }}>
                    <Users size={16} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '600', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{g.name}</p>
                    <h4 style={{ color: 'var(--text-primary)', marginTop: '0.15rem', fontSize: '0.95rem' }}>{formatCurrency(groupTotal)}</h4>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Charts Section */}
      {filteredTransactions.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--text-secondary)' }}>
          Hãy nạp file sao kê ngân hàng để bắt đầu phân tích dữ liệu chi tiêu.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Top Row: Two Pie Charts side-by-side */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '1.5rem' }}>
            
            {/* Expenses by Category (Pie Chart) */}
            <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: '380px' }}>
              <div>
                <h3>Phân bổ Chi tiêu Cá nhân</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Không bao gồm tiền mua hộ/chi tiêu nhóm
                </p>
              </div>
              
              {categoryChartData.length > 0 ? (
                <div style={{ display: 'flex', flex: '1', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', gap: '1rem' }}>
                  <div style={{ width: '220px', height: '220px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={4}
                          dataKey="value"
                        >
                          {categoryChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: any) => formatCurrency(Number(value || 0))} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  
                  {/* Custom Legend */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: '1', minWidth: '180px' }}>
                    {categoryChartData.map((cat, idx) => {
                      const percentage = ((cat.value / stats.totalPersonalExpense) * 100).toFixed(1);
                      return (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: cat.color }}></div>
                            <span>{cat.name}</span>
                          </div>
                          <span style={{ fontWeight: '700' }}>{percentage}% ({formatCurrency(cat.value)})</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div style={{ flex: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', fontSize: '0.9rem' }}>
                  Chưa có dữ liệu chi tiêu cá nhân trong kỳ này.
                </div>
              )}
            </div>

            {/* Expenses by Group (Pie Chart) */}
            <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: '380px' }}>
              <div>
                <h3>Phân bổ Chi tiêu Nhóm & Mua hộ</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Bao gồm tiền mua hộ gom nhóm và mua hộ tự do
                </p>
              </div>
              
              {groupChartData.length > 0 ? (
                <div style={{ display: 'flex', flex: '1', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', gap: '1rem' }}>
                  <div style={{ width: '220px', height: '220px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={groupChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={4}
                          dataKey="value"
                        >
                          {groupChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: any) => formatCurrency(Number(value || 0))} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  
                  {/* Custom Legend */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: '1', minWidth: '180px' }}>
                    {groupChartData.map((g, idx) => {
                      const totalChartVal = groupChartData.reduce((acc, curr) => acc + curr.value, 0);
                      const percentage = ((g.value / (totalChartVal || 1)) * 100).toFixed(1);
                      return (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: g.color }}></div>
                            <span>{g.name}</span>
                          </div>
                          <span style={{ fontWeight: '700' }}>{percentage}% ({formatCurrency(g.value)})</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div style={{ flex: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', fontSize: '0.9rem' }}>
                  Chưa có dữ liệu chi tiêu nhóm trong kỳ này.
                </div>
              )}
            </div>

          </div>

          {/* Bottom Row: Full-width Historical Trends Bar Chart */}
          <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: '360px', width: '100%' }}>
            <div>
              <h3>Xu hướng Chi tiêu & Ưu đãi</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                So sánh Chi tiêu cá nhân vs Mua hộ vs Ưu đãi tích lũy qua các kỳ
              </p>
            </div>
            
            {historyChartData.length > 0 ? (
              <div style={{ flex: '1', width: '100%', height: '260px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={historyChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                    <XAxis dataKey="name" stroke="var(--text-secondary)" fontSize={11} tickLine={false} />
                    <YAxis stroke="var(--text-secondary)" fontSize={11} tickLine={false} tickFormatter={(v) => `${(v/1000000).toFixed(1)}M`} />
                    <Tooltip formatter={(value: any) => formatCurrency(Number(value || 0))} />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: '0.8rem', paddingTop: '10px' }} />
                    <Bar dataKey="Chi tiêu cá nhân" fill="var(--color-danger)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Chi tiêu mua hộ/nhóm" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Ưu đãi tích lũy" fill="var(--color-success)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div style={{ flex: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', fontSize: '0.9rem' }}>
                Cần có dữ liệu sao kê để vẽ biểu đồ so sánh.
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
};
