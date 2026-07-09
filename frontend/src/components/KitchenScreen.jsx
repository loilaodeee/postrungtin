import React, { useState, useEffect } from 'react';
import { Clock, Check, X, AlertTriangle, ChefHat } from 'lucide-react';
import { socket } from '../socket';

// Component for individual ticket countdown
function TicketTimer({ timestamp }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    // Calculate elapsed time in seconds
    const update = () => {
      const diff = Math.floor((Date.now() - timestamp) / 1000);
      setElapsed(diff > 0 ? diff : 0);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [timestamp]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const timeString = `${mins}:${secs.toString().padStart(2, '0')}`;

  let levelClass = 'timer-ok';
  if (mins >= 5 && mins < 10) levelClass = 'timer-warning';
  if (mins >= 10) levelClass = 'timer-critical';

  return (
    <span className={`ticket-timer ${levelClass}`}>
      <Clock size={14} style={{ marginRight: 4 }} />
      {timeString}
    </span>
  );
}

export default function KitchenScreen({ state, onToggleItem, onCompleteOrder, onCancelOrder }) {
  const handleComplete = (orderId) => {
    onCompleteOrder(orderId);
  };

  const handleCancel = (orderId, tableName) => {
    if (window.confirm(`Bạn muốn hủy và xóa bỏ phiếu làm món của ${tableName}?`)) {
      onCancelOrder(orderId);
    }
  };

  const activeOrders = state.kitchenOrders || [];

  return (
    <div className="kitchen-container">
      <div className="kitchen-header-bar flex-between card">
        <div className="flex-center gap-8">
          <ChefHat size={28} className="text-primary" />
          <h2 className="kitchen-title">Bếp Chế Biến</h2>
        </div>
        <div className="kitchen-stats-pill">
          Đang làm: <strong>{activeOrders.length} phiếu</strong>
        </div>
      </div>

      {activeOrders.length === 0 ? (
        <div className="empty-kitchen-state card">
          <ChefHat size={60} className="text-muted bounce-slow" />
          <h2>Bếp Nhàn Rỗi</h2>
          <p>Chưa có đơn hàng nào được gửi xuống. Màn hình sẽ tự động cập nhật khi có món mới.</p>
        </div>
      ) : (
        <div className="kitchen-tickets-grid">
          {activeOrders.map(order => {
            const allChecked = order.items.every(item => item.completed);
            const orderAgeMins = Math.floor((Date.now() - order.timestamp) / 60000);
            
            let cardClass = 'ticket-card card';
            if (orderAgeMins >= 10) cardClass += ' border-critical';
            else if (orderAgeMins >= 5) cardClass += ' border-warning';

            return (
              <div key={order.id} className={cardClass}>
                {/* Header */}
                <div className="ticket-header">
                  <div>
                    <h3 className="ticket-table-name">{order.tableName}</h3>
                    <span className="ticket-time-stamp">Đặt lúc: {order.time}</span>
                  </div>
                  <TicketTimer timestamp={order.timestamp} />
                </div>

                {/* Body Items list with Checkboxes */}
                <div className="ticket-body">
                  {order.items.map((item, idx) => (
                    <label key={idx} className={`ticket-item-row ${item.completed ? 'checked' : ''}`}>
                      <input
                        type="checkbox"
                        checked={item.completed}
                        onChange={() => onToggleItem(order.id, idx)}
                      />
                      <span className="checkbox-custom"></span>
                      <div className="ticket-item-details">
                        <span className="ticket-item-name">{item.name}</span>
                        {item.notes && item.notes.length > 0 && (
                          <span className="ticket-item-notes">↳ {item.notes.join(', ')}</span>
                        )}
                      </div>
                    </label>
                  ))}
                </div>

                {/* Footer Actions */}
                <div className="ticket-footer">
                  <button
                    className="btn-ticket-cancel flex-center"
                    onClick={() => handleCancel(order.id, order.tableName)}
                    title="Hủy phiếu order"
                  >
                    <X size={16} />
                  </button>

                  <button
                    className="btn-ticket-done flex-center gap-4 ready"
                    onClick={() => handleComplete(order.id)}
                  >
                    <Check size={18} />
                    <span>HOÀN THÀNH</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
