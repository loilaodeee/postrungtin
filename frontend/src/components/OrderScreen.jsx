import React, { useState, useEffect } from 'react';
import { ShoppingCart, Send, CreditCard, Trash2, Info, LayoutGrid, UtensilsCrossed, Clock, CheckCircle } from 'lucide-react';
import NoteModal from './NoteModal';
import { socket } from '../socket';

const PRICE_PER_PORTION = 40000;

export default function OrderScreen({ state, onPlaceOrder, onClearTable }) {
  const [selectedTable, setSelectedTable] = useState(null);
  const [draftItems, setDraftItems] = useState({}); // mapping: tableName -> array of draft items
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [pendingFood, setPendingFood] = useState(null); // stores { id, name, price }
  
  // Mobile sub-tab state: 'tables' | 'menu' | 'cart'
  const [mobileSubTab, setMobileSubTab] = useState('tables');

  // Touch Swipe Gesture coordinates
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const minSwipeDistance = 70; // minimum pixels to count as swipe

  useEffect(() => {
    function onTakeawayCreated(newKey) {
      setSelectedTable(newKey);
      setMobileSubTab('menu');
    }
    socket.on('takeaway-created', onTakeawayCreated);
    return () => {
      socket.off('takeaway-created', onTakeawayCreated);
    };
  }, []);

  const handleCreateTakeaway = () => {
    socket.emit('create-takeaway');
  };

  // Dynamic menu and tables from server state
  const menu = state.menu || [];
  const tables = Object.keys(state.tables || {});

  // Fetch all active tables (which have orders and are not empty)
  const activeTablesList = tables.filter(t => state.tables[t].items.length > 0);

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

    setDraftItems(prev => {
      const newList = [...(prev[selectedTable] || []), newItem];
      newList.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
      return {
        ...prev,
        [selectedTable]: newList
      };
    });
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

  const handlePayTable = (tableName = selectedTable) => {
    if (!tableName) return;
    const tableState = state.tables[tableName];
    const totalSentItems = tableState?.items.length || 0;

    if (totalSentItems === 0) {
      if ((draftItems[tableName] || []).length > 0) {
        if (window.confirm(`Bạn muốn hủy các món nháp chưa gửi bếp và làm trống ${tableName}?`)) {
          setDraftItems(prev => ({ ...prev, [tableName]: [] }));
        }
      } else {
        alert('Bàn này đang trống, không thể thanh toán!');
      }
      return;
    }

    // Safety guard: only allow checkout if the kitchen has completed at least one dish (table status must be 'served')
    if (tableState.status !== 'served') {
      alert(`Không thể thanh toán ${tableName}!\nBàn này đang chờ nấu, chưa có món nào xong.`);
      return;
    }

    const tableTotal = tableState.items.reduce((sum, item) => sum + (item.price || 40000), 0);
    if (window.confirm(`Xác nhận thanh toán và giải phóng ${tableName}?\nTổng số tiền: ${tableTotal.toLocaleString('vi-VN')}đ`)) {
      onClearTable(tableName);
      setDraftItems(prev => ({ ...prev, [tableName]: [] }));
      
      // If we just paid the selected table, go back to tables list on mobile
      if (tableName === selectedTable) {
        setMobileSubTab('tables');
      }
    }
  };

  // Swipe Gestures Logic
  const handleTouchStart = (e) => {
    // Ignore swipe events in modal backdrop or forms
    if (e.target.closest('.modal-backdrop') || e.target.closest('.custom-note-input') || e.target.closest('.admin-container')) return;
    setTouchEnd(null);
    setTouchStart({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY
    });
  };

  const handleTouchMove = (e) => {
    if (!touchStart) return;
    setTouchEnd({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY
    });
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distanceX = touchStart.x - touchEnd.x;
    const distanceY = touchStart.y - touchEnd.y;
    
    // Ignore vertical scroll gestures to avoid interference
    if (Math.abs(distanceY) > 55) {
      setTouchStart(null);
      setTouchEnd(null);
      return;
    }

    // Optimized threshold (50px distance) and clean horizontal slope (1.5x of Y)
    if (Math.abs(distanceX) > 50 && Math.abs(distanceX) > Math.abs(distanceY) * 1.5) {
      if (distanceX > 0) {
        // Swiped Left -> Go Next Tab
        if (mobileSubTab === 'tables') {
          if (selectedTable) {
            setMobileSubTab('menu');
          } else {
            alert('Vui lòng chọn bàn trước khi chuyển sang chọn món!');
          }
        } else if (mobileSubTab === 'menu') {
          setMobileSubTab('cart');
        }
      } else {
        // Swiped Right -> Go Prev Tab
        if (mobileSubTab === 'cart') {
          setMobileSubTab('menu');
        } else if (mobileSubTab === 'menu') {
          setMobileSubTab('tables');
        }
      }
    }
    setTouchStart(null);
    setTouchEnd(null);
  };

  return (
    <div 
      className="order-screen-wrapper"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
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
          onClick={() => setMobileSubTab('cart')}
        >
          <ShoppingCart size={16} />
          <span>3. Đơn Hàng</span>
          {activeTablesList.length > 0 && (
            <span className="sub-nav-badge animate-pop">
              {activeTablesList.length} bàn
            </span>
          )}
        </button>
      </div>

      <div className="order-grid-container">
        {/* Step 1: Table Selection */}
        <div className={`panel card step-tables-panel ${mobileSubTab === 'tables' ? 'mobile-visible' : 'mobile-hidden'}`}>
          <h3 className="panel-title">Bước 1: Chọn Bàn / Hình thức</h3>
          <div className="table-btn-grid">
            {/* 1. Physical Tables */}
            {tables.filter(t => !t.startsWith('Mang Về ')).map(table => {
              const status = getTableStatus(table);
              const itemsCount = getTableItemsCount(table);
              const isSelected = selectedTable === table;
              
              let btnClass = 'table-card-btn';
              if (isSelected) btnClass += ' active';
              if (status === 'cooking') btnClass += ' status-cooking';
              if (status === 'served') btnClass += ' status-served';

              return (
                <button
                  key={table}
                  className={btnClass}
                  onClick={() => handleSelectTable(table)}
                >
                  <span className="table-card-name">{table}</span>
                  {itemsCount > 0 && (
                    <span className="table-card-badge animate-pop">{itemsCount} món</span>
                  )}
                  {status !== 'empty' && (
                    <span className={`table-status-label ${status}`}>
                      {status === 'cooking' ? '🔥 Đang nấu' : '✅ Đang phục vụ'}
                    </span>
                  )}
                </button>
              );
            })}

            {/* 2. Active Takeaway Tickets */}
            {tables.filter(t => t.startsWith('Mang Về ')).map(table => {
              const status = getTableStatus(table);
              const itemsCount = getTableItemsCount(table);
              const isSelected = selectedTable === table;
              
              let btnClass = 'table-card-btn takeaway-btn';
              if (isSelected) btnClass += ' active';
              if (status === 'cooking') btnClass += ' status-cooking';
              if (status === 'served') btnClass += ' status-served';

              return (
                <button
                  key={table}
                  className={btnClass}
                  onClick={() => handleSelectTable(table)}
                >
                  <span className="table-card-name">🛒 {table}</span>
                  {itemsCount > 0 && (
                    <span className="table-card-badge animate-pop">{itemsCount} món</span>
                  )}
                  {status !== 'empty' && (
                    <span className={`table-status-label ${status}`}>
                      {status === 'cooking' ? '🔥 Đang nấu' : '✅ Đang phục vụ'}
                    </span>
                  )}
                </button>
              );
            })}

            {/* 3. Button to Create New Dynamic Takeaway Order */}
            <button
              className="table-card-btn add-takeaway-btn flex-center"
              onClick={handleCreateTakeaway}
              style={{
                border: '2px dashed var(--primary)',
                background: 'transparent',
                color: 'var(--primary)',
                cursor: 'pointer'
              }}
            >
              <span className="table-card-name" style={{ fontWeight: 700 }}>➕ Mang Về Mới</span>
            </button>
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
          
          {selectedTable ? (
            /* Selected Table Cart Detailed View */
            <div className="cart-wrapper">
              <h3 className="panel-title flex-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8, marginBottom: 12 }}>
                <span>🛒 Chi tiết đơn</span>
                <span className="selected-table-label">{selectedTable}</span>
              </h3>
              
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
                  <div className="empty-cart-state" style={{ padding: '30px 10px' }}>
                    <Info size={30} className="text-muted" />
                    <p>Bàn trống. Vui lòng chọn món trong thực đơn.</p>
                  </div>
                )}
              </div>

              {/* Total and actions */}
              <div className="cart-summary-section" style={{ borderTop: '2px solid var(--border)' }}>
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
                    onClick={() => handlePayTable()}
                    disabled={activeSentItems.length === 0 && activeDraftItems.length === 0}
                  >
                    <CreditCard size={18} />
                    <span>💳 THANH TOÁN</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Main bird's eye view when no table is active */
            <div className="all-orders-birdseye flex-col-grow">
              <h3 className="panel-title flex-between">
                <span>📋 Danh Sách Bàn Có Đơn</span>
                <span className="active-count-badge">{activeTablesList.length} bàn đang ngồi</span>
              </h3>
              
              <div className="active-tables-scroller">
                {activeTablesList.length === 0 ? (
                  <div className="empty-cart-state" style={{ padding: '60px 20px' }}>
                    <CheckCircle size={40} className="text-success" />
                    <h4 style={{ color: 'var(--text-main)', marginTop: 12 }}>Tất cả các bàn trống</h4>
                    <p style={{ fontSize: '0.85rem' }}>Chọn tab "Bàn" để mở bàn mới và ghi món ăn.</p>
                  </div>
                ) : (
                  <div className="active-tables-flex-list">
                    {activeTablesList.map(tableName => {
                      const tableInfo = state.tables[tableName];
                      const tableTotal = tableInfo.items.reduce((sum, item) => sum + (item.price || 40000), 0);
                      const status = tableInfo.status;
                      
                      return (
                        <div key={tableName} className={`active-table-mini-card ${status}`}>
                          <div className="active-card-header flex-between">
                            <div className="flex-center gap-4">
                              <span className="active-card-name">{tableName}</span>
                              <span className={`active-status-dot ${status}`}></span>
                            </div>
                            <span className="active-card-time">
                              <Clock size={12} style={{ marginRight: 3 }} />
                              {tableInfo.startTime}
                            </span>
                          </div>

                          <div className="active-card-items-summary">
                            {tableInfo.items.map((item, index) => (
                              <div key={index} className="mini-item-row">
                                <span className="mini-item-name">{item.name}</span>
                                {item.notes && item.notes.length > 0 && (
                                  <span className="mini-item-notes">({item.notes.join(', ')})</span>
                                )}
                              </div>
                            ))}
                          </div>

                          <div className="active-card-footer flex-between">
                            <span className="active-card-total">
                              Tổng: <strong>{tableTotal.toLocaleString('vi-VN')}đ</strong>
                            </span>
                            <button 
                              className="btn-pay-mini flex-center gap-4"
                              onClick={() => handlePayTable(tableName)}
                            >
                              <CreditCard size={14} />
                              <span>Thanh Toán</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Quick toggle to show all unpaid tables summary even if a table is currently selected */}
          {selectedTable && activeTablesList.length > 0 && (
            <button 
              className="btn-show-all-tables-summary"
              onClick={() => setSelectedTable(null)}
            >
              Xem danh sách tất cả các bàn ({activeTablesList.length})
            </button>
          )}

        </div>
      </div>

      {/* Note modal */}
      <NoteModal
        isOpen={isNoteModalOpen}
        onClose={() => setIsNoteModalOpen(false)}
        onConfirm={handleConfirmNotes}
        foodName={pendingFood ? pendingFood.name : ''}
        quickNotes={state.quickNotes || []}
      />
    </div>
  );
}
