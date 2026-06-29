import React, { useState } from 'react';
import { ShoppingCart, Send, CreditCard, Trash2, Info, LayoutGrid, UtensilsCrossed } from 'lucide-react';
import NoteModal from './NoteModal';

export default function OrderScreen({ state, onPlaceOrder, onClearTable }) {
  const [selectedTable, setSelectedTable] = useState(null);
  const [draftItems, setDraftItems] = useState({}); // mapping: tableName -> array of draft items
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [pendingFood, setPendingFood] = useState(null); // stores { id, name, price }
  
  // Mobile sub-tab state: 'tables' | 'menu' | 'cart'
  const [mobileSubTab, setMobileSubTab] = useState('tables');

  // Dynamic menu and tables from server state
  const menu = state.menu || [];
  const tables = Object.keys(state.tables || {});

  const getTableStatus = (tableName) => {
    return state.tables[tableName]?.status || 'empty';
  };

  const getTableItemsCount = (tableName) => {
    const sentCount = state.tables[tableName]?.items.length || 0;
    const draftCount = draftItems[tableName]?.length || 0;
    return sentCount + draftCount;
  };

  const handleSelectTable = (tableName) => {
    setSelectedTable(tableName);
    // Auto-navigate to Menu tab on mobile after selecting a table
    setMobileSubTab('menu');
  };

  const handleSelectFood = (foodItem) => {
    if (!selectedTable) {
      alert('Vui lòng chọn BÀN hoặc MANG VỀ trước khi chọn món!');
      return;
    }
    setPendingFood(foodItem);
    setIsNoteModalOpen(true);
  };

  const handleConfirmNotes = (notes) => {
    if (!pendingFood) return;
    const newItem = {
      id: Date.now() + Math.random().toString(36).substr(2, 5),
      name: pendingFood.name,
      price: pendingFood.price,
      notes: notes
    };

    setDraftItems(prev => ({
      ...prev,
      [selectedTable]: [...(prev[selectedTable] || []), newItem]
    }));
  };

  const handleRemoveDraftItem = (index) => {
    setDraftItems(prev => {
      const list = [...(prev[selectedTable] || [])];
      list.splice(index, 1);
      return {
        ...prev,
        [selectedTable]: list
      };
    });
  };

  const handleSendToKitchen = () => {
    if (!selectedTable) return;
    const itemsToSend = draftItems[selectedTable] || [];
    if (itemsToSend.length === 0) {
      alert('Không có món mới nào để gửi xuống bếp!');
      return;
    }

    onPlaceOrder(selectedTable, itemsToSend);

    // Clear draft for this table
    setDraftItems(prev => ({
      ...prev,
      [selectedTable]: []
    }));

    // Auto-navigate to Cart tab to see the cooking status
    setMobileSubTab('cart');
  };

  const activeTableState = selectedTable ? state.tables[selectedTable] : null;
  const activeSentItems = activeTableState?.items || [];
  const activeDraftItems = selectedTable ? (draftItems[selectedTable] || []) : [];
  
  // Calculate dynamic pricing based on actual menu item price
  const totalSentAmount = activeSentItems.reduce((sum, item) => sum + (item.price || 40000), 0);
  const totalDraftAmount = activeDraftItems.reduce((sum, item) => sum + (item.price || 40000), 0);
  const totalAmount = totalSentAmount + totalDraftAmount;

  const handlePayTable = () => {
    if (!selectedTable) return;
    const tableState = state.tables[selectedTable];
    const totalSentItems = tableState?.items.length || 0;

    if (totalSentItems === 0) {
      if ((draftItems[selectedTable] || []).length > 0) {
        if (window.confirm('Bạn muốn hủy các món nháp chưa gửi bếp và làm trống bàn?')) {
          setDraftItems(prev => ({ ...prev, [selectedTable]: [] }));
        }
      } else {
        alert('Bàn này đang trống, không thể thanh toán!');
      }
      return;
    }

    if (window.confirm(`Xác nhận thanh toán và giải phóng ${selectedTable}?\nTổng số tiền: ${totalSentAmount.toLocaleString('vi-VN')}đ`)) {
      onClearTable(selectedTable);
      setDraftItems(prev => ({ ...prev, [selectedTable]: [] }));
      // Go back to table selection on mobile
      setMobileSubTab('tables');
    }
  };

  return (
    <div className="order-screen-wrapper">
      {/* Mobile Sub-Navigation Bar (visible only on mobile) */}
      <div className="mobile-sub-nav">
        <button 
          className={`sub-nav-btn ${mobileSubTab === 'tables' ? 'active' : ''}`}
          onClick={() => setMobileSubTab('tables')}
        >
          <LayoutGrid size={16} />
          <span>1. Bàn</span>
        </button>
        <button 
          className={`sub-nav-btn ${mobileSubTab === 'menu' ? 'active' : ''}`}
          onClick={() => {
            if (!selectedTable) {
              alert('Vui lòng chọn bàn trước!');
              return;
            }
            setMobileSubTab('menu');
          }}
          disabled={!selectedTable}
        >
          <UtensilsCrossed size={16} />
          <span>2. Chọn Món</span>
        </button>
        <button 
          className={`sub-nav-btn ${mobileSubTab === 'cart' ? 'active' : ''}`}
          onClick={() => {
            if (!selectedTable) {
              alert('Vui lòng chọn bàn trước!');
              return;
            }
            setMobileSubTab('cart');
          }}
          disabled={!selectedTable}
        >
          <ShoppingCart size={16} />
          <span>3. Đơn Hàng</span>
          {(activeSentItems.length + activeDraftItems.length) > 0 && (
            <span className="sub-nav-badge animate-pop">
              {activeSentItems.length + activeDraftItems.length}
            </span>
          )}
        </button>
      </div>

      <div className="order-grid-container">
        {/* Step 1: Table Selection */}
        <div className={`panel card step-tables-panel ${mobileSubTab === 'tables' ? 'mobile-visible' : 'mobile-hidden'}`}>
          <h3 className="panel-title">Bước 1: Chọn Bàn / Hình thức</h3>
          <div className="table-btn-grid">
            {tables.map(table => {
              const status = getTableStatus(table);
              const itemsCount = getTableItemsCount(table);
              const isSelected = selectedTable === table;
              
              let btnClass = 'table-card-btn';
              if (isSelected) btnClass += ' active';
              if (status === 'cooking') btnClass += ' status-cooking';
              if (status === 'served') btnClass += ' status-served';
              if (table === 'Mang Về') btnClass += ' takeaway-btn';

              return (
                <button
                  key={table}
                  className={btnClass}
                  onClick={() => handleSelectTable(table)}
                >
                  <span className="table-card-name">{table === 'Mang Về' ? '🛒 Mang Về' : table}</span>
                  {itemsCount > 0 && (
                    <span className="table-card-badge animate-pop">{itemsCount} món</span>
                  )}
                  {status !== 'empty' && (
                    <span className={`table-status-label ${status}`}>
                      {status === 'cooking' ? '🔥 Đang làm' : '✅ Đã phục vụ'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2: Menu Options */}
        <div className={`panel card step-menu-panel ${mobileSubTab === 'menu' ? 'mobile-visible' : 'mobile-hidden'}`}>
          <h3 className="panel-title flex-between">
            <span>Bước 2: Chọn Món</span>
            {selectedTable && (
              <span className="menu-table-badge">{selectedTable}</span>
            )}
          </h3>
          <div className="menu-btn-grid">
            {menu.map(food => (
              <button
                key={food.id}
                className="menu-card-btn"
                onClick={() => handleSelectFood(food)}
              >
                <div className="menu-card-details">
                  <span className="menu-food-name">{food.name}</span>
                  <span className="menu-food-price">{food.price.toLocaleString('vi-VN')}đ</span>
                </div>
              </button>
            ))}
            {menu.length === 0 && (
              <p className="no-data-text" style={{ gridColumn: 'span 2' }}>
                Thực đơn trống. Vui lòng vào Cài Đặt để thêm món.
              </p>
            )}
          </div>
        </div>

        {/* Step 3: Cart & Billing details */}
        <div className={`panel card cart-sidebar step-cart-panel ${mobileSubTab === 'cart' ? 'mobile-visible' : 'mobile-hidden'}`}>
          <h3 className="panel-title flex-between">
            <span>🛒 Chi tiết đơn</span>
            <span className="selected-table-label">
              {selectedTable ? selectedTable : 'Chưa chọn bàn'}
            </span>
          </h3>

          {selectedTable ? (
            <div className="cart-wrapper">
              <div className="cart-items-list">
                {/* Sent items (cooking or served) */}
                {activeSentItems.length > 0 && (
                  <div className="cart-section">
                    <div className="cart-section-header sent">Đã gửi bếp ({activeSentItems.length})</div>
                    {activeSentItems.map((item, idx) => (
                      <div key={`sent-${idx}`} className="cart-list-item sent">
                        <div className="item-info">
                          <span className="item-name">{idx + 1}. {item.name}</span>
                          {item.notes && item.notes.length > 0 && (
                            <span className="item-notes">✍️ Ghi chú: {item.notes.join(', ')}</span>
                          )}
                        </div>
                        <span className="item-price">
                          {(item.price || 40000).toLocaleString('vi-VN')}đ
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Draft items (unsubmitted) */}
                {activeDraftItems.length > 0 && (
                  <div className="cart-section">
                    <div className="cart-section-header draft">Chưa gửi bếp ({activeDraftItems.length})</div>
                    {activeDraftItems.map((item, idx) => (
                      <div key={`draft-${item.id}`} className="cart-list-item draft">
                        <div className="item-info">
                          <span className="item-name">{idx + 1}. {item.name}</span>
                          {item.notes && item.notes.length > 0 && (
                            <span className="item-notes">✍️ Ghi chú: {item.notes.join(', ')}</span>
                          )}
                        </div>
                        <div className="item-actions">
                          <span className="item-price" style={{ marginRight: 8 }}>
                            {(item.price || 40000).toLocaleString('vi-VN')}đ
                          </span>
                          <button
                            className="btn-icon-danger"
                            onClick={() => handleRemoveDraftItem(idx)}
                            title="Xóa món nháp"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {activeSentItems.length === 0 && activeDraftItems.length === 0 && (
                  <div className="empty-cart-state">
                    <Info size={36} className="text-muted" />
                    <p>Bàn trống. Vui lòng chọn món trong thực đơn.</p>
                  </div>
                )}
              </div>

              {/* Total and actions */}
              <div className="cart-summary-section">
                <div className="cart-total-row">
                  <span>Tổng cộng:</span>
                  <span className="total-price">{totalAmount.toLocaleString('vi-VN')}đ</span>
                </div>

                <div className="cart-actions-grid">
                  <button
                    className="btn-success flex-center gap-4"
                    onClick={handleSendToKitchen}
                    disabled={activeDraftItems.length === 0}
                  >
                    <Send size={18} />
                    <span>⚡ GỬI BẾP</span>
                  </button>
                  
                  <button
                    className="btn-primary-payment flex-center gap-4"
                    onClick={handlePayTable}
                    disabled={activeSentItems.length === 0 && activeDraftItems.length === 0}
                  >
                    <CreditCard size={18} />
                    <span>💳 THANH TOÁN</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-cart-state">
              <Info size={40} className="text-muted" />
              <p>Vui lòng chọn bàn/hình thức đặt hàng trước để bắt đầu.</p>
            </div>
          )}
        </div>
      </div>

      {/* Note modal */}
      <NoteModal
        isOpen={isNoteModalOpen}
        onClose={() => setIsNoteModalOpen(false)}
        onConfirm={handleConfirmNotes}
        foodName={pendingFood ? pendingFood.name : ''}
      />
    </div>
  );
}
