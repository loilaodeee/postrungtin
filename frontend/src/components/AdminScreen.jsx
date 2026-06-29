import React, { useState } from 'react';
import { Plus, Trash2, Edit2, Check, X, ShieldAlert, Coffee } from 'lucide-react';
import { socket } from '../socket';

export default function AdminScreen({ state }) {
  const [newTableName, setNewTableName] = useState('');
  const [newFoodName, setNewFoodName] = useState('');
  const [newFoodPrice, setNewFoodPrice] = useState('');

  // Editing state for menu items: { id: null | string, name: '', price: '' }
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [editingPrice, setEditingPrice] = useState('');

  const menu = state.menu || [];
  const tables = Object.keys(state.tables || {});

  // Table Handlers
  const handleAddTable = (e) => {
    e.preventDefault();
    if (!newTableName.trim()) return;
    socket.emit('admin-add-table', newTableName);
    setNewTableName('');
  };

  const handleDeleteTable = (tableName) => {
    const tableInfo = state.tables[tableName];
    if (tableInfo.status !== 'empty' || tableInfo.items.length > 0) {
      alert('Không thể xóa bàn đang có khách hoặc đang chờ chế biến!');
      return;
    }
    if (window.confirm(`Bạn chắc chắn muốn xóa "${tableName}" khỏi danh sách?`)) {
      socket.emit('admin-delete-table', tableName);
    }
  };

  // Menu Handlers
  const handleAddFood = (e) => {
    e.preventDefault();
    if (!newFoodName.trim() || !newFoodPrice) return;
    socket.emit('admin-add-menu-item', {
      name: newFoodName,
      price: Number(newFoodPrice)
    });
    setNewFoodName('');
    setNewFoodPrice('');
  };

  const handleDeleteFood = (id, name) => {
    if (window.confirm(`Bạn chắc chắn muốn xóa món "${name}" khỏi thực đơn?`)) {
      socket.emit('admin-delete-menu-item', id);
    }
  };

  const startEdit = (item) => {
    setEditingItemId(item.id);
    setEditingName(item.name);
    setEditingPrice(item.price);
  };

  const cancelEdit = () => {
    setEditingItemId(null);
  };

  const saveEdit = (id) => {
    if (!editingName.trim() || !editingPrice) return;
    socket.emit('admin-edit-menu-item', {
      id,
      name: editingName,
      price: Number(editingPrice)
    });
    setEditingItemId(null);
  };

  return (
    <div className="admin-container">
      {/* Banner */}
      <div className="kitchen-header-bar flex-between card" style={{ marginBottom: 20 }}>
        <div className="flex-center gap-8">
          <ShieldAlert size={28} className="text-primary" />
          <h2 className="kitchen-title">Cấu Hình Hệ Thống (Admin Panel)</h2>
        </div>
        <div className="stats-pill-dark">
          Thiết lập menu & phòng bàn
        </div>
      </div>

      <div className="stats-main-grid">
        {/* Tables Manager */}
        <div className="stats-panel card">
          <h3 className="panel-title">🚪 Quản Lý Bàn Ăn</h3>
          
          {/* Add Table Form */}
          <form className="admin-form-row" onSubmit={handleAddTable}>
            <input
              type="text"
              className="custom-note-input"
              value={newTableName}
              onChange={(e) => setNewTableName(e.target.value)}
              placeholder="Nhập tên bàn mới (Ví dụ: Bàn 7, VIP 1)"
              required
            />
            <button type="submit" className="btn-primary flex-center gap-4" style={{ whiteSpace: 'nowrap' }}>
              <Plus size={18} />
              <span>Thêm Bàn</span>
            </button>
          </form>

          {/* Tables List */}
          <div className="admin-items-list" style={{ marginTop: 16 }}>
            {tables.length === 0 ? (
              <p className="no-data-text">Chưa có bàn nào được cài đặt.</p>
            ) : (
              tables.map(table => {
                const tableInfo = state.tables[table];
                const isActive = tableInfo.status !== 'empty';
                return (
                  <div key={table} className="admin-list-row flex-between">
                    <div className="admin-row-info">
                      <strong>{table}</strong>
                      <span className={`admin-status-badge ${tableInfo.status}`} style={{ marginLeft: 8 }}>
                        {tableInfo.status === 'empty' ? 'Trống' : tableInfo.status === 'cooking' ? 'Đang nấu' : 'Đã phục vụ'}
                      </span>
                    </div>
                    <button
                      className="btn-icon-danger"
                      onClick={() => handleDeleteTable(table)}
                      disabled={isActive}
                      title={isActive ? 'Không thể xóa bàn đang phục vụ' : 'Xóa bàn'}
                      style={{ opacity: isActive ? 0.3 : 1 }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Menu Manager */}
        <div className="stats-panel card">
          <h3 className="panel-title">🍜 Quản Lý Thực Đơn</h3>
          
          {/* Add Food Form */}
          <form className="admin-form-column" onSubmit={handleAddFood}>
            <div className="form-inputs-group">
              <input
                type="text"
                className="custom-note-input"
                value={newFoodName}
                onChange={(e) => setNewFoodName(e.target.value)}
                placeholder="Tên hủ tiếu / món nước"
                required
              />
              <input
                type="number"
                className="custom-note-input price-input"
                value={newFoodPrice}
                onChange={(e) => setNewFoodPrice(e.target.value)}
                placeholder="Giá tiền (đ)"
                min="0"
                required
              />
            </div>
            <button type="submit" className="btn-primary flex-center gap-4" style={{ marginTop: 8 }}>
              <Plus size={18} />
              <span>Thêm Món Ăn</span>
            </button>
          </form>

          {/* Menu List */}
          <div className="admin-items-list" style={{ marginTop: 16 }}>
            {menu.length === 0 ? (
              <p className="no-data-text">Chưa có món ăn nào trong thực đơn.</p>
            ) : (
              menu.map(item => {
                const isEditing = editingItemId === item.id;
                return (
                  <div key={item.id} className="admin-list-row flex-between">
                    {isEditing ? (
                      /* Editing View */
                      <div className="admin-row-edit-form">
                        <input
                          type="text"
                          className="custom-note-input inline-edit"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          required
                        />
                        <input
                          type="number"
                          className="custom-note-input inline-edit price"
                          value={editingPrice}
                          onChange={(e) => setEditingPrice(e.target.value)}
                          required
                        />
                        <div className="edit-actions-group">
                          <button className="btn-icon-success" onClick={() => saveEdit(item.id)}>
                            <Check size={16} />
                          </button>
                          <button className="btn-icon-secondary" onClick={cancelEdit}>
                            <X size={16} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Display View */
                      <>
                        <div className="admin-row-info">
                          <strong>{item.name}</strong>
                          <span className="price-tag-badge">
                            {item.price.toLocaleString('vi-VN')}đ
                          </span>
                        </div>
                        <div className="admin-row-actions">
                          <button
                            className="btn-icon-primary"
                            onClick={() => startEdit(item)}
                            title="Sửa món"
                            style={{ marginRight: 8 }}
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            className="btn-icon-danger"
                            onClick={() => handleDeleteFood(item.id, item.name)}
                            title="Xóa món"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
      <style>{`
        .admin-form-row {
          display: flex;
          gap: 8px;
        }
        .admin-form-column {
          display: flex;
          flex-direction: column;
        }
        .form-inputs-group {
          display: flex;
          gap: 8px;
        }
        .price-input {
          max-width: 140px;
        }
        .admin-items-list {
          overflow-y: auto;
          max-height: 450px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .admin-list-row {
          padding: 10px 14px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background-color: var(--bg-card);
        }
        .admin-status-badge {
          font-size: 0.75rem;
          padding: 2px 8px;
          border-radius: 4px;
          font-weight: 600;
        }
        .admin-status-badge.empty {
          background-color: #f1f5f9;
          color: var(--text-muted);
        }
        .admin-status-badge.cooking {
          background-color: var(--warning-light);
          color: var(--warning-dark);
        }
        .admin-status-badge.served {
          background-color: var(--success-light);
          color: var(--success-dark);
        }
        .price-tag-badge {
          background-color: var(--success-light);
          color: var(--success-dark);
          font-size: 0.8rem;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 99px;
          margin-left: 8px;
        }
        .stats-pill-dark {
          background-color: #1e293b;
          color: #94a3b8;
          font-size: 0.85rem;
          font-weight: 600;
          padding: 6px 14px;
          border-radius: 99px;
        }
        .btn-icon-primary {
          background: transparent;
          border: none;
          color: var(--primary);
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
        }
        .btn-icon-primary:hover {
          background-color: var(--primary-light);
        }
        .admin-row-edit-form {
          display: flex;
          width: 100%;
          gap: 6px;
          align-items: center;
        }
        .inline-edit {
          flex: 1;
          padding: 6px 8px;
          font-size: 0.9rem;
        }
        .inline-edit.price {
          max-width: 100px;
        }
        .edit-actions-group {
          display: flex;
          gap: 4px;
        }
        .btn-icon-success, .btn-icon-secondary {
          background: transparent;
          border: none;
          padding: 4px;
          border-radius: 4px;
          cursor: pointer;
          display: flex;
          align-items: center;
        }
        .btn-icon-success {
          color: var(--success);
        }
        .btn-icon-success:hover {
          background-color: var(--success-light);
        }
        .btn-icon-secondary {
          color: var(--text-muted);
        }
        .btn-icon-secondary:hover {
          background-color: #f1f5f9;
        }
        @media (max-width: 768px) {
          .form-inputs-group {
            flex-direction: column;
          }
          .price-input {
            max-width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
