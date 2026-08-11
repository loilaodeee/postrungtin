import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert } from 'react-native';

export default function AdminScreen({
  state,
  socketUrl,
  onSaveSocketUrl,
  onAddMenuItem,
  onDeleteMenuItem,
  onAddTable,
  onDeleteTable,
  onAddQuickNote,
  onDeleteQuickNote,
  onEditQuickNote,
  onResetAll,
  connectionError
}) {
  // Local config states
  const [ipInput, setIpInput] = useState(socketUrl || '');
  
  // Menu form states
  const [foodName, setFoodName] = useState('');
  const [foodPrice, setFoodPrice] = useState('');

  // Table form states
  const [tableNameInput, setTableNameInput] = useState('');

  // Quick notes states
  const [noteInput, setNoteInput] = useState('');
  const [editingNoteText, setEditingNoteText] = useState<string | null>(null);
  const [editingNoteValue, setEditingNoteValue] = useState('');

  const menu = state.menu || [];
  const tables = Object.keys(state.tables || {});

  const handleSaveConnection = () => {
    if (!ipInput.trim()) {
      Alert.alert('Lỗi', 'Vui lòng nhập địa chỉ IP hoặc ngrok URL!');
      return;
    }
    
    // Add http:// prefix if missing
    let formattedUrl = ipInput.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `http://${formattedUrl}`;
    }

    onSaveSocketUrl(formattedUrl);
  };

  const handleAddFood = () => {
    if (!foodName.trim() || !foodPrice.trim()) {
      Alert.alert('Lỗi', 'Vui lòng nhập đầy đủ tên và giá món!');
      return;
    }
    const priceNum = Number(foodPrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      Alert.alert('Lỗi', 'Giá món ăn phải là số lớn hơn 0!');
      return;
    }

    onAddMenuItem(foodName.trim(), priceNum);
    setFoodName('');
    setFoodPrice('');
  };

  const handleAddTable = () => {
    if (!tableNameInput.trim()) {
      Alert.alert('Lỗi', 'Vui lòng nhập tên bàn (Ví dụ: Bàn 7)!');
      return;
    }
    
    if (tables.includes(tableNameInput.trim())) {
      Alert.alert('Lỗi', 'Bàn này đã tồn tại trong sơ đồ!');
      return;
    }

    onAddTable(tableNameInput.trim());
    setTableNameInput('');
  };

  const handleReset = () => {
    Alert.alert(
      'Reset Doanh Thu & Dữ Liệu',
      'CẢNH BÁO: Hành động này sẽ xóa toàn bộ lịch sử hóa đơn, reset lại món ăn và các bàn về mặc định. Bạn có chắc muốn thực hiện?',
      [
        { text: 'Hủy bỏ', style: 'cancel' },
        { 
          text: 'Đồng ý Reset', 
          style: 'destructive',
          onPress: onResetAll 
        }
      ]
    );
  };

  // Quick Notes handlers
  const quickNotes = state.quickNotes || [];

  const handleAddNote = () => {
    if (!noteInput.trim()) {
      Alert.alert('Lỗi', 'Vui lòng nhập nội dung ghi chú!');
      return;
    }
    onAddQuickNote(noteInput.trim());
    setNoteInput('');
  };

  const handleDeleteNote = (noteText: string) => {
    Alert.alert(
      'Xác nhận xóa',
      `Bạn chắc chắn muốn xóa ghi chú "${noteText}"?`,
      [
        { text: 'Hủy bỏ', style: 'cancel' },
        {
          text: 'Đồng ý xóa',
          style: 'destructive',
          onPress: () => onDeleteQuickNote(noteText)
        }
      ]
    );
  };

  const handleStartEditNote = (noteText: string) => {
    setEditingNoteText(noteText);
    setEditingNoteValue(noteText);
  };

  const handleCancelEditNote = () => {
    setEditingNoteText(null);
  };

  const handleSaveEditNote = (oldNoteText: string) => {
    if (!editingNoteValue.trim()) {
      Alert.alert('Lỗi', 'Vui lòng nhập nội dung ghi chú!');
      return;
    }
    onEditQuickNote(oldNoteText, editingNoteValue.trim());
    setEditingNoteText(null);
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      {/* 1. Connection Config */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>⚙️ CÀI ĐẶT KẾT NỐI SERVER</Text>
        <Text style={styles.helpText}>
          Nhập IP server:
        </Text>
        <TextInput
          style={styles.textInput}
          placeholder="Ví dụ: 192.168.1.15:3005 hoặc IP VPS"
          placeholderTextColor="#94a3b8"
          value={ipInput}
          onChangeText={setIpInput}
        />
        <TouchableOpacity style={styles.btnPrimary} onPress={handleSaveConnection}>
          <Text style={styles.btnText}>LƯU & KẾT NỐI LẠI</Text>
        </TouchableOpacity>
        {connectionError && (
          <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: 'bold', marginTop: 10, lineHeight: 16 }}>
            ❌ Lỗi kết nối: {connectionError}
          </Text>
        )}
        <Text style={styles.activeConnectionText}>
          Đang cấu hình: <Text style={styles.textHighlight}>{socketUrl || 'Chưa cấu hình'}</Text>
        </Text>
      </View>

      {/* 2. Menu Management */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>🍜 THÊM MÓN ĂN THỰC ĐƠN</Text>
        <View style={styles.formRow}>
          <TextInput
            style={[styles.textInput, { flex: 2 }]}
            placeholder="Tên món ăn"
            placeholderTextColor="#94a3b8"
            value={foodName}
            onChangeText={setFoodName}
          />
          <TextInput
            style={[styles.textInput, { flex: 1 }]}
            placeholder="Giá"
            placeholderTextColor="#94a3b8"
            keyboardType="numeric"
            value={foodPrice}
            onChangeText={setFoodPrice}
          />
        </View>
        <TouchableOpacity style={styles.btnSuccess} onPress={handleAddFood}>
          <Text style={styles.btnText}>➕ THÊM MÓN MỚI</Text>
        </TouchableOpacity>

        <Text style={styles.subLabel}>Thực đơn hiện tại ({menu.length} món):</Text>
        <View style={styles.listContainer}>
          {menu.map(item => (
            <View key={item.id} style={styles.listItemRow}>
              <View>
                <Text style={styles.listItemName}>{item.name}</Text>
                <Text style={styles.listItemDetail}>{item.price.toLocaleString('vi-VN')}đ</Text>
              </View>
              <TouchableOpacity onPress={() => onDeleteMenuItem(item.id)}>
                <Text style={styles.textDelete}>Xóa</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </View>

      {/* 3. Table Management */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>🪑 CẤU HÌNH SƠ ĐỒ BÀN ĂN</Text>
        <TextInput
          style={styles.textInput}
          placeholder="Nhập tên bàn mới (ví dụ: Bàn 7)"
          placeholderTextColor="#94a3b8"
          value={tableNameInput}
          onChangeText={setTableNameInput}
        />
        <TouchableOpacity style={styles.btnPrimary} onPress={handleAddTable}>
          <Text style={styles.btnText}>➕ THÊM BÀN ĂN</Text>
        </TouchableOpacity>

        <Text style={styles.subLabel}>Danh sách bàn hiện tại ({tables.length} bàn):</Text>
        <View style={styles.listContainer}>
          {tables.map(table => {
            const tableState = state.tables[table];
            const isOccupied = tableState?.items.length > 0;
            return (
              <View key={table} style={styles.listItemRow}>
                <Text style={styles.listItemName}>
                  {table} {isOccupied && <Text style={styles.occupiedIndicator}>(Có khách)</Text>}
                </Text>
                <TouchableOpacity 
                  onPress={() => onDeleteTable(table)}
                  disabled={isOccupied}
                  style={{ opacity: isOccupied ? 0.3 : 1 }}
                >
                  <Text style={styles.textDelete}>Xóa</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      </View>

      {/* 4. Quick Notes Management */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>✍️ QUẢN LÝ GHI CHÚ MÓN ĂN</Text>
        <TextInput
          style={styles.textInput}
          placeholder="Nhập gợi ý ghi chú mới (Ví dụ: Không hành)"
          placeholderTextColor="#94a3b8"
          value={noteInput}
          onChangeText={setNoteInput}
        />
        <TouchableOpacity style={styles.btnPrimary} onPress={handleAddNote}>
          <Text style={styles.btnText}>➕ THÊM GHI CHÚ</Text>
        </TouchableOpacity>

        <Text style={styles.subLabel}>Danh sách gợi ý ghi chú ({quickNotes.length}):</Text>
        <View style={styles.listContainer}>
          {quickNotes.map(note => {
            const isEditing = editingNoteText === note;
            return (
              <View key={note} style={styles.listItemRow}>
                {isEditing ? (
                  <View style={{ flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <TextInput
                      style={[styles.textInput, { flex: 1, marginBottom: 0, paddingVertical: 6 }]}
                      value={editingNoteValue}
                      onChangeText={setEditingNoteValue}
                      autoFocus
                    />
                    <TouchableOpacity onPress={() => handleSaveEditNote(note)}>
                      <Text style={{ color: '#10b981', fontSize: 13, fontWeight: '700', paddingHorizontal: 6 }}>Lưu</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleCancelEditNote}>
                      <Text style={{ color: '#64748b', fontSize: 13, fontWeight: '700', paddingHorizontal: 6 }}>Hủy</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <Text style={styles.listItemName}>{note}</Text>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <TouchableOpacity onPress={() => handleStartEditNote(note)}>
                        <Text style={{ color: '#2563eb', fontSize: 13, fontWeight: '600' }}>Sửa</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDeleteNote(note)}>
                        <Text style={styles.textDelete}>Xóa</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            );
          })}
        </View>
      </View>

      {/* 5. Reset settings */}
      <View style={[styles.sectionCard, { marginBottom: 40 }]}>
        <Text style={styles.sectionTitle}>⚠️ QUẢN TRỊ HỆ THỐNG</Text>
        <Text style={styles.helpText}>
          Xóa toàn bộ doanh thu tích lũy, các phiếu bếp cũ và đưa hệ thống về trạng thái ban đầu để kiểm nghiệm:
        </Text>
        <TouchableOpacity style={styles.btnDanger} onPress={handleReset}>
          <Text style={styles.btnText}>RESET DOANH THU & DỮ LIỆU</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 16,
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    elevation: 1,
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 6,
  },
  helpText: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 18,
    marginBottom: 10,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
    marginBottom: 12,
  },
  formRow: {
    flexDirection: 'row',
    gap: 8,
  },
  btnPrimary: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSuccess: {
    backgroundColor: '#10b981',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDanger: {
    backgroundColor: '#ef4444',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  activeConnectionText: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 10,
  },
  textHighlight: {
    fontWeight: 'bold',
    color: '#2563eb',
  },
  subLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    marginTop: 18,
    marginBottom: 8,
  },
  listContainer: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  listItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  listItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  listItemDetail: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  occupiedIndicator: {
    color: '#f59e0b',
    fontSize: 12,
    fontWeight: 'bold',
  },
  textDelete: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '600',
  },
});
