import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Dimensions } from 'react-native';
import NoteModal from './NoteModal';

const { width: screenWidth } = Dimensions.get('window');

// Memoized Table Card Component to optimize 60fps rendering in grids
const TableCard = React.memo(({ table, status, count, isSelected, onPress }) => {
  return (
    <TouchableOpacity
      style={[
        styles.tableCard,
        status === 'cooking' && styles.tableCooking,
        status === 'served' && styles.tableServed,
        isSelected && styles.tableSelected
      ]}
      onPress={() => onPress(table)}
    >
      <Text style={[styles.tableName, isSelected && styles.textWhite]}>
        {table.startsWith('Mang Về ') ? `🛒 MV ${table.replace('Mang Về ', '')}` : table}
      </Text>
      {count > 0 && (
        <View style={[styles.tableCountBadge, isSelected && styles.badgeWhite]}>
          <Text style={[styles.tableCountBadgeText, isSelected && styles.textPrimary]}>{count} món</Text>
        </View>
      )}
      {status !== 'empty' && (
        <View style={[styles.statusPill, status === 'cooking' ? styles.pillCooking : styles.pillServed]}>
          <Text style={styles.statusPillText}>
            {status === 'cooking' ? '🔥 Đang nấu' : '✅ Phục vụ'}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
});

// Memoized Food Card Component to prevent redraws on state toggles
const FoodCard = React.memo(({ food, onPress }) => {
  return (
    <TouchableOpacity
      style={styles.foodCard}
      onPress={() => onPress(food)}
    >
      <View style={styles.foodInfo}>
        <Text style={styles.foodName}>{food.name}</Text>
        <Text style={styles.foodPrice}>{food.price.toLocaleString('vi-VN')}đ</Text>
      </View>
      <View style={styles.foodAddBtn}>
        <Text style={styles.foodAddBtnText}>+</Text>
      </View>
    </TouchableOpacity>
  );
});

export default function OrderScreen({ state, onPlaceOrder, onClearTable, onCreateTakeaway, draftItems, setDraftItems }) {
  const [selectedTable, setSelectedTable] = useState(null);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [pendingFood, setPendingFood] = useState(null);
  
  // Mobile sub-tab: 'tables' | 'menu' | 'cart'
  const [mobileSubTab, setMobileSubTab] = useState('tables');
  const scrollViewRef = useRef(null);
  const touchStartPageX = useRef(0);
  const touchStartPageY = useRef(0);

  const menu = state.menu || [];
  const tables = useMemo(() => Object.keys(state.tables || {}), [state.tables]);
  
  // Memoized tables filtered lists
  const physicalTables = useMemo(() => tables.filter(t => !t.startsWith('Mang Về ')), [tables]);
  const activeTakeaways = useMemo(() => tables.filter(t => t.startsWith('Mang Về ')), [tables]);
  const activeTablesList = useMemo(() => tables.filter(t => state.tables[t].items.length > 0), [tables, state.tables]);

  const getTableStatus = useCallback((tableName) => {
    return state.tables[tableName]?.status || 'empty';
  }, [state.tables]);

  const getTableItemsCount = useCallback((tableName) => {
    const sentCount = state.tables[tableName]?.items.length || 0;
    const draftCount = draftItems[tableName]?.length || 0;
    return sentCount + draftCount;
  }, [state.tables, draftItems]);

  // Sync scroll position when active sub tab changes programmatically
  const handleTabChange = useCallback((tabName, index) => {
    setMobileSubTab(tabName);
    scrollViewRef.current?.scrollTo({ x: index * screenWidth, animated: true });
  }, []);

  const handleSelectTable = useCallback((tableName) => {
    setSelectedTable(tableName);
    handleTabChange('menu', 1);
  }, [handleTabChange]);

  const handleSelectFood = useCallback((foodItem) => {
    if (!selectedTable) {
      Alert.alert('Thông báo', 'Vui lòng chọn bàn trước!');
      return;
    }
    setPendingFood(foodItem);
    setIsNoteModalOpen(true);
  }, [selectedTable]);

  const handleConfirmNotes = useCallback((notes) => {
    if (!pendingFood || !selectedTable) return;
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
  }, [pendingFood, selectedTable, setDraftItems]);

  const handleRemoveDraftItem = useCallback((index) => {
    if (!selectedTable) return;
    setDraftItems(prev => {
      const list = [...(prev[selectedTable] || [])];
      list.splice(index, 1);
      return { ...prev, [selectedTable]: list };
    });
  }, [selectedTable, setDraftItems]);

  const handleSendToKitchen = useCallback(() => {
    if (!selectedTable) return;
    const itemsToSend = draftItems[selectedTable] || [];
    if (itemsToSend.length === 0) {
      Alert.alert('Thông báo', 'Không có món mới nào để gửi xuống bếp!');
      return;
    }

    onPlaceOrder(selectedTable, itemsToSend);

    // Clear draft
    setDraftItems(prev => ({
      ...prev,
      [selectedTable]: []
    }));

    handleTabChange('cart', 2);
  }, [selectedTable, draftItems, onPlaceOrder, setDraftItems, handleTabChange]);

  const activeTableState = selectedTable ? state.tables[selectedTable] : null;
  const activeSentItems = useMemo(() => activeTableState?.items || [], [activeTableState]);
  const activeDraftItems = useMemo(() => selectedTable ? (draftItems[selectedTable] || []) : [], [selectedTable, draftItems]);
  
  const totalSentAmount = useMemo(() => activeSentItems.reduce((sum, item) => sum + (item.price || 40000), 0), [activeSentItems]);
  const totalDraftAmount = useMemo(() => activeDraftItems.reduce((sum, item) => sum + (item.price || 40000), 0), [activeDraftItems]);
  const totalAmount = useMemo(() => totalSentAmount + totalDraftAmount, [totalSentAmount, totalDraftAmount]);

  const handlePayTable = useCallback((tableName = selectedTable) => {
    if (!tableName) return;
    const tableState = state.tables[tableName];
    const totalSentItems = tableState?.items.length || 0;

    if (totalSentItems === 0) {
      if ((draftItems[tableName] || []).length > 0) {
        Alert.alert(
          'Hủy đơn nháp',
          `Bạn muốn hủy các món nháp chưa gửi bếp và làm trống ${tableName}?`,
          [
            { text: 'Hủy bỏ', style: 'cancel' },
            { 
              text: 'Đồng ý', 
              onPress: () => setDraftItems(prev => ({ ...prev, [tableName]: [] }))
            }
          ]
        );
      } else {
        Alert.alert('Lỗi', 'Bàn này đang trống, không thể thanh toán!');
      }
      return;
    }

    if (tableState.status !== 'served') {
      Alert.alert('Cảnh báo', `Không thể thanh toán ${tableName}!\nBàn này đang chờ chế biến (Đang nấu), chưa có món nào hoàn thành.`);
      return;
    }

    const tableTotal = tableState.items.reduce((sum, item) => sum + (item.price || 40000), 0);
    Alert.alert(
      'Thanh toán',
      `Xác nhận thanh toán và giải phóng ${tableName}?\nTổng số tiền: ${tableTotal.toLocaleString('vi-VN')}đ`,
      [
        { text: 'Hủy', style: 'cancel' },
        { 
          text: 'Xác nhận', 
          onPress: () => {
            onClearTable(tableName);
            setDraftItems(prev => ({ ...prev, [tableName]: [] }));
            if (tableName === selectedTable) {
              setSelectedTable(null);
              handleTabChange('tables', 0);
            }
          }
        }
      ]
    );
  }, [selectedTable, state.tables, draftItems, onClearTable, setDraftItems, handleTabChange]);

  const handleBackToTables = useCallback(() => {
    setSelectedTable(null);
    handleTabChange('tables', 0);
  }, [handleTabChange]);

  return (
    <View style={styles.container}>
      {/* Sub tabs nav */}
      <View style={styles.subNavBar}>
        <TouchableOpacity 
          style={[styles.subNavBtn, mobileSubTab === 'tables' && styles.subNavBtnActive]}
          onPress={() => handleTabChange('tables', 0)}
        >
          <Text style={[styles.subNavText, mobileSubTab === 'tables' && styles.subNavTextActive]}>1. SƠ ĐỒ BÀN</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.subNavBtn, mobileSubTab === 'menu' && styles.subNavBtnActive]}
          onPress={() => handleTabChange('menu', 1)}
        >
          <Text style={[styles.subNavText, mobileSubTab === 'menu' && styles.subNavTextActive]}>2. CHỌN MÓN</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.subNavBtn, mobileSubTab === 'cart' && styles.subNavBtnActive]}
          onPress={() => handleTabChange('cart', 2)}
        >
          <Text style={[styles.subNavText, mobileSubTab === 'cart' && styles.subNavTextActive]}>3. ĐƠN HÀNG</Text>
          {activeTablesList.length > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{activeTablesList.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Main horizontal pagination panel content */}
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        removeClippedSubviews={true} // Performance optimization for hidden panels
        onTouchStart={(e) => {
          touchStartPageX.current = e.nativeEvent.pageX;
          touchStartPageY.current = e.nativeEvent.pageY;
        }}
        onResponderRelease={(e) => {
          const deltaX = e.nativeEvent.pageX - touchStartPageX.current;
          const deltaY = e.nativeEvent.pageY - touchStartPageY.current;
          const threshold = 60; // minimum drag distance in pixels to trigger wrap

          // Ensure horizontal swipe is dominant to avoid conflicts with vertical scrolling
          if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > threshold) {
            if (mobileSubTab === 'tables' && deltaX > 0) {
              // Swiped right on the first page -> Wrap to 'cart' (page 2)
              handleTabChange('cart', 2);
            } else if (mobileSubTab === 'cart' && deltaX < 0) {
              // Swiped left on the last page -> Wrap to 'tables' (page 0)
              handleTabChange('tables', 0);
            }
          }
        }}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
          const tabs = ['tables', 'menu', 'cart'];
          setMobileSubTab(tabs[index]);
        }}
        style={styles.panelContent}
      >
        {/* Page 0: Tables List */}
        <View style={{ width: screenWidth }}>
          <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false} removeClippedSubviews={true}>
            <Text style={styles.sectionTitle}>Sơ đồ phòng bàn:</Text>
            <View style={styles.grid}>
              {physicalTables.map(table => (
                <TableCard
                  key={table}
                  table={table}
                  status={getTableStatus(table)}
                  count={getTableItemsCount(table)}
                  isSelected={selectedTable === table}
                  onPress={handleSelectTable}
                />
              ))}
            </View>

            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Đơn mang về:</Text>
            <View style={styles.grid}>
              {activeTakeaways.map(table => (
                <TableCard
                  key={table}
                  table={table}
                  status={getTableStatus(table)}
                  count={getTableItemsCount(table)}
                  isSelected={selectedTable === table}
                  onPress={handleSelectTable}
                />
              ))}

              <TouchableOpacity
                style={[styles.tableCard, styles.btnAddTakeaway]}
                onPress={onCreateTakeaway}
              >
                <Text style={styles.btnAddTakeawayText}>➕ MV Mới</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>

        {/* Page 1: Food Menu Grid */}
        <View style={{ width: screenWidth }}>
          <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false} removeClippedSubviews={true}>
            <View style={styles.menuHeader}>
              <Text style={styles.sectionTitle}>Thực đơn chọn món:</Text>
              <View style={styles.activeTableBadge}>
                <Text style={styles.activeTableBadgeText}>📍 {selectedTable || 'Vui lòng chọn bàn'}</Text>
              </View>
            </View>

            <View style={styles.grid}>
              {menu.map(food => (
                <FoodCard
                  key={food.id}
                  food={food}
                  onPress={handleSelectFood}
                />
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Page 2: Cart / Active Orders overview */}
        <View style={{ width: screenWidth }}>
          <View style={styles.cartContainer}>
            {selectedTable ? (
              <View style={styles.fullFlex}>
                <View style={styles.cartHeader}>
                  <View>
                    <Text style={styles.cartTitle}>Chi tiết đơn hàng</Text>
                    <Text style={styles.cartSubtitle}>Bàn đang chọn: {selectedTable}</Text>
                  </View>
                  <TouchableOpacity style={styles.btnChangeTable} onPress={handleBackToTables}>
                    <Text style={styles.btnChangeTableText}>Xem tất cả bàn</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.cartScroller} showsVerticalScrollIndicator={false}>
                  {activeSentItems.length > 0 && (
                    <View style={styles.cartCard}>
                      <View style={styles.cartCardHeaderSent}>
                        <Text style={styles.cartCardTitleSent}>Đã gửi bếp chế biến ({activeSentItems.length})</Text>
                      </View>
                      <View style={styles.cartCardBody}>
                        {activeSentItems.map((item, idx) => (
                          <View key={`sent-${idx}`} style={styles.cartItemRow}>
                            <View style={styles.cartItemInfo}>
                              <Text style={styles.cartItemName}>{idx + 1}. {item.name}</Text>
                              {item.notes && item.notes.length > 0 && (
                                <Text style={styles.cartItemNotes}>↳ Ghi chú: {item.notes.join(', ')}</Text>
                              )}
                            </View>
                            <Text style={styles.cartItemPrice}>{(item.price || 40000).toLocaleString('vi-VN')}đ</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {activeDraftItems.length > 0 && (
                    <View style={styles.cartCard}>
                      <View style={styles.cartCardHeaderDraft}>
                        <Text style={styles.cartCardTitleDraft}>Đơn nháp chưa gửi bếp ({activeDraftItems.length})</Text>
                      </View>
                      <View style={styles.cartCardBody}>
                        {activeDraftItems.map((item, idx) => (
                          <View key={`draft-${item.id}`} style={styles.cartItemRow}>
                            <View style={styles.cartItemInfo}>
                              <Text style={styles.cartItemName}>{idx + 1}. {item.name}</Text>
                              {item.notes && item.notes.length > 0 && (
                                <Text style={styles.cartItemNotes}>↳ Ghi chú: {item.notes.join(', ')}</Text>
                              )}
                            </View>
                            <View style={styles.cartItemActions}>
                              <Text style={[styles.cartItemPrice, { marginRight: 16 }]}>{(item.price || 40000).toLocaleString('vi-VN')}đ</Text>
                              <TouchableOpacity style={styles.btnDeleteDraft} onPress={() => handleRemoveDraftItem(idx)}>
                                <Text style={styles.textDelete}>Xóa</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {activeSentItems.length === 0 && activeDraftItems.length === 0 && (
                    <View style={styles.emptyCartBox}>
                      <Text style={styles.emptyCartIcon}>🛒</Text>
                      <Text style={styles.emptyCartText}>Giỏ hàng của bàn này đang trống</Text>
                    </View>
                  )}
                </ScrollView>

                <View style={styles.cartFooter}>
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>TỔNG CỘNG HÓA ĐƠN:</Text>
                    <Text style={styles.totalValue}>{totalAmount.toLocaleString('vi-VN')}đ</Text>
                  </View>

                  <View style={styles.actionsRow}>
                    <TouchableOpacity 
                      style={[styles.btnKitchen, activeDraftItems.length === 0 && styles.btnDisabled]}
                      onPress={handleSendToKitchen}
                      disabled={activeDraftItems.length === 0}
                    >
                      <Text style={styles.btnActionText}>⚡ GỬI BẾP</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                      style={[styles.btnCheckout, activeSentItems.length === 0 && activeDraftItems.length === 0 && styles.btnDisabled]}
                      onPress={() => handlePayTable()}
                      disabled={activeSentItems.length === 0 && activeDraftItems.length === 0}
                    >
                      <Text style={styles.btnActionText}>💳 THANH TOÁN</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.fullFlex}>
                <Text style={styles.sectionTitle}>Bàn chưa thanh toán ({activeTablesList.length}):</Text>
                <ScrollView contentContainerStyle={styles.activeTablesScroll} showsVerticalScrollIndicator={false}>
                  {activeTablesList.map(tableName => {
                    const tableInfo = state.tables[tableName];
                    const tableTotal = tableInfo.items.reduce((sum, item) => sum + (item.price || 40000), 0);
                    const status = tableInfo.status;

                    return (
                      <View key={tableName} style={[styles.activeTableCard, status === 'served' ? styles.borderServed : styles.borderCooking]}>
                        <View style={styles.activeCardHeader}>
                          <Text style={styles.activeCardName}>📍 {tableName}</Text>
                          <View style={[styles.statusPillMini, status === 'served' ? styles.pillServed : styles.pillCooking]}>
                            <Text style={styles.statusPillMiniText}>
                              {status === 'served' ? 'Đang phục vụ' : 'Đang nấu'}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.activeCardItems}>
                          {tableInfo.items.map((item, idx) => (
                            <Text key={idx} style={styles.miniItemText}>
                              • {item.name} {item.notes && item.notes.length > 0 ? `(${item.notes.join(', ')})` : ''}
                            </Text>
                          ))}
                        </View>

                        <View style={styles.activeCardFooter}>
                          <Text style={styles.activeCardTotal}>Tổng tiền: <Text style={styles.textHighlight}>{tableTotal.toLocaleString('vi-VN')}đ</Text></Text>
                          <TouchableOpacity 
                            style={[styles.btnPayMini, status !== 'served' && styles.btnDisabled]}
                            onPress={() => handlePayTable(tableName)}
                            disabled={status !== 'served'}
                          >
                            <Text style={styles.btnPayMiniText}>Thanh Toán</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}

                  {activeTablesList.length === 0 && (
                    <View style={styles.emptyCartBox}>
                      <Text style={styles.emptyCartIcon}>✅</Text>
                      <Text style={styles.emptyCartText}>Không có bàn nào chưa thanh toán</Text>
                    </View>
                  )}
                </ScrollView>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      <NoteModal
        isOpen={isNoteModalOpen}
        onClose={() => setIsNoteModalOpen(false)}
        onConfirm={handleConfirmNotes}
        foodName={pendingFood ? pendingFood.name : ''}
        quickNotes={state.quickNotes || []}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  subNavBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 12,
    padding: 4,
    elevation: 2,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  subNavBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    position: 'relative',
  },
  subNavBtnActive: {
    backgroundColor: '#2563eb',
  },
  subNavText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.3,
  },
  subNavTextActive: {
    color: '#ffffff',
  },
  tabBadge: {
    position: 'absolute',
    top: 2,
    right: 4,
    backgroundColor: '#ef4444',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  tabBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '900',
  },
  panelContent: {
    flex: 1,
  },
  scrollContainer: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  tableCard: {
    width: '30.5%',
    aspectRatio: 1.05,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 6,
    elevation: 1,
    shadowColor: '#0f172a',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
  },
  tableSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#2563eb',
    elevation: 4,
    shadowColor: '#2563eb',
    shadowOpacity: 0.3,
  },
  tableCooking: {
    backgroundColor: '#fffbeb',
    borderColor: '#fef3c7',
  },
  tableServed: {
    backgroundColor: '#f0fdf4',
    borderColor: '#dcfce7',
  },
  tableName: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'center',
  },
  tableCountBadge: {
    backgroundColor: '#eff6ff',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeWhite: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  tableCountBadgeText: {
    color: '#2563eb',
    fontSize: 10,
    fontWeight: '800',
  },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  pillCooking: {
    backgroundColor: '#fef3c7',
  },
  pillServed: {
    backgroundColor: '#dcfce7',
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#475569',
  },
  takeawayCard: {
    borderColor: '#cbd5e1',
  },
  btnAddTakeaway: {
    borderColor: '#3b82f6',
    borderStyle: 'dashed',
    borderWidth: 2,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    elevation: 0,
  },
  btnAddTakeawayText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#3b82f6',
    textAlign: 'center',
  },
  menuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  activeTableBadge: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  activeTableBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1d4ed8',
  },
  foodCard: {
    width: '47.8%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    aspectRatio: 1.6,
    elevation: 1,
  },
  foodInfo: {
    flex: 1,
    height: '100%',
    justifyContent: 'space-between',
  },
  foodName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
    lineHeight: 18,
  },
  foodPrice: {
    fontSize: 13,
    color: '#2563eb',
    fontWeight: '900',
  },
  foodAddBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  foodAddBtnText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#2563eb',
  },
  cartContainer: {
    flex: 1,
    padding: 12,
  },
  fullFlex: {
    flex: 1,
  },
  cartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    elevation: 1,
  },
  cartTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
  },
  cartSubtitle: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
    fontWeight: '600',
  },
  btnChangeTable: {
    backgroundColor: '#eff6ff',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  btnChangeTableText: {
    fontSize: 11,
    color: '#2563eb',
    fontWeight: '800',
  },
  cartScroller: {
    flex: 1,
  },
  cartCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    marginBottom: 12,
    overflow: 'hidden',
    elevation: 1,
  },
  cartCardHeaderSent: {
    backgroundColor: '#10b981',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  cartCardTitleSent: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  cartCardHeaderDraft: {
    backgroundColor: '#f59e0b',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  cartCardTitleDraft: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  cartCardBody: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  cartItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  cartItemInfo: {
    flex: 1,
  },
  cartItemName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
  },
  cartItemNotes: {
    fontSize: 11,
    color: '#d97706',
    fontStyle: 'italic',
    marginTop: 2,
    fontWeight: '600',
  },
  cartItemPrice: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  cartItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  btnDeleteDraft: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#fef2f2',
  },
  textDelete: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: '800',
  },
  emptyCartBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    elevation: 1,
  },
  emptyCartIcon: {
    fontSize: 44,
    marginBottom: 12,
    opacity: 0.6,
  },
  emptyCartText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '700',
  },
  cartFooter: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    marginTop: 8,
    elevation: 2,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  totalLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#2563eb',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  btnKitchen: {
    flex: 1,
    backgroundColor: '#f59e0b',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCheckout: {
    flex: 1,
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    backgroundColor: '#cbd5e1',
  },
  btnActionText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
  },
  activeTablesScroll: {
    gap: 12,
    paddingBottom: 20,
  },
  activeTableCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    padding: 12,
    borderLeftWidth: 6,
    elevation: 1,
  },
  borderCooking: {
    borderLeftColor: '#f59e0b',
  },
  borderServed: {
    borderLeftColor: '#10b981',
  },
  activeCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 8,
    marginBottom: 10,
  },
  activeCardName: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0f172a',
  },
  statusPillMini: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusPillMiniText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#475569',
  },
  activeCardItems: {
    marginBottom: 12,
  },
  miniItemText: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 18,
    fontWeight: '500',
  },
  activeCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 8,
  },
  activeCardTotal: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  textHighlight: {
    fontWeight: '900',
    color: '#2563eb',
    fontSize: 13,
  },
  btnPayMini: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  btnPayMiniText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  textWhite: {
    color: '#ffffff',
  },
  textPrimary: {
    color: '#2563eb',
  },
});
