import React, { useState, useEffect } from 'react';
import { TrendingUp, ShoppingBag, Award, Clock, RotateCcw, ArrowRight } from 'lucide-react';

export default function StatsScreen() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const getApiUrl = (path) => {
    const isDev = window.location.port === '5173' || window.location.port === '5174';
    const host = isDev ? `http://${window.location.hostname}:3005` : '';
    return `${host}${path}`;
  };

  const fetchStats = async () => {
    try {
      setLoading(true);
      const res = await fetch(getApiUrl('/api/stats'));
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleResetStats = async () => {
    if (window.confirm('Bạn chắc chắn muốn xóa toàn bộ lịch sử bán hàng và đặt lại doanh thu hôm nay chứ?')) {
      try {
        const res = await fetch(getApiUrl('/api/reset-stats'), { method: 'POST' });
        if (res.ok) {
          alert('Đã xóa dữ liệu thống kê thành công.');
          fetchStats();
        }
      } catch (err) {
        console.error('Reset error:', err);
      }
    }
  };

  if (loading) {
    return (
      <div className="empty-kitchen-state card">
        <div className="spinner"></div>
        <p>Đang tải dữ liệu báo cáo...</p>
      </div>
    );
  }

  const { totalRevenue = 0, orderCount = 0, itemsSold = {}, historyList = [] } = stats || {};

  // Sort popular items
  const popularItemsSorted = Object.entries(itemsSold).sort((a, b) => b[1] - a[1]);
  const maxSoldQty = popularItemsSorted.length > 0 ? popularItemsSorted[0][1] : 1;

  return (
    <div className="stats-container">
      {/* Stats Cards Row */}
      <div className="stats-cards-grid">
        <div className="stats-card card">
          <div className="card-icon-wrapper revenue">
            <TrendingUp size={24} />
          </div>
          <div className="card-data">
            <span className="card-label">Tổng Doanh Thu</span>
            <h2 className="card-value">{totalRevenue.toLocaleString('vi-VN')}đ</h2>
          </div>
        </div>

        <div className="stats-card card">
          <div className="card-icon-wrapper orders">
            <ShoppingBag size={24} />
          </div>
          <div className="card-data">
            <span className="card-label">Số Đơn Hoàn Thành</span>
            <h2 className="card-value">{orderCount} đơn</h2>
          </div>
        </div>

        <div className="stats-card card">
          <div className="card-icon-wrapper dishes">
            <Award size={24} />
          </div>
          <div className="card-data">
            <span className="card-label">Tô Hủ Tiếu Đã Bán</span>
            <h2 className="card-value">
              {Object.values(itemsSold).reduce((a, b) => a + b, 0)} tô
            </h2>
          </div>
        </div>
      </div>

      <div className="stats-main-grid">
        {/* Popular Dishes */}
        <div className="stats-panel card">
          <h3 className="panel-title">🏆 Món Ăn Bán Chạy</h3>
          {popularItemsSorted.length === 0 ? (
            <p className="no-data-text">Chưa có dữ liệu bán hàng.</p>
          ) : (
            <div className="popular-list">
              {popularItemsSorted.map(([name, count]) => {
                const percentage = (count / maxSoldQty) * 100;
                return (
                  <div key={name} className="popular-item-row">
                    <div className="popular-item-info">
                      <span className="popular-item-name">{name}</span>
                      <strong className="popular-item-qty">{count} tô</strong>
                    </div>
                    <div className="progress-bar-bg">
                      <div
                        className="progress-bar-fill"
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sales History */}
        <div className="stats-panel card history-panel-container">
          <div className="flex-between" style={{ marginBottom: 16 }}>
            <h3 className="panel-title" style={{ margin: 0 }}>📋 Lịch Sử Giao Dịch</h3>
            <button className="btn-danger-outline flex-center gap-4" onClick={handleResetStats}>
              <RotateCcw size={14} />
              <span>Đóng Ca / Xóa Số Liệu</span>
            </button>
          </div>

          {historyList.length === 0 ? (
            <p className="no-data-text">Chưa có giao dịch nào được ghi nhận.</p>
          ) : (
            <div className="history-list-wrapper">
              {historyList.map(order => (
                <div key={order.id} className="history-record-card">
                  <div className="history-record-header flex-between">
                    <div>
                      <strong className="record-table-name">{order.tableName}</strong>
                      <span className="record-date-label">
                        <Clock size={12} style={{ margin: '0 4px 0 8px' }} />
                        {order.startTime} → {order.endTime} | {order.date}
                      </span>
                    </div>
                    <strong className="record-total-amount">
                      {order.totalPrice.toLocaleString('vi-VN')}đ
                    </strong>
                  </div>
                  
                  <div className="record-items-summary">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="record-item-pill">
                        {item.name}
                        {item.notes && item.notes.length > 0 && (
                          <span className="record-item-note-text">
                            ({item.notes.join(', ')})
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
