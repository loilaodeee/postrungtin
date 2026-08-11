import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';

// Small ticket timer component in React Native
function TicketTimer({ timestamp }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
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

  let levelStyle = styles.timerOk;
  if (mins >= 5 && mins < 10) levelStyle = styles.timerWarning;
  if (mins >= 10) levelStyle = styles.timerCritical;

  return (
    <View style={[styles.timerContainer, levelStyle]}>
      <Text style={styles.timerText}>🕒 {timeString}</Text>
    </View>
  );
}

export default function KitchenScreen({ state, onToggleItem, onCompleteOrder, onCancelOrder }) {
  const activeOrders = state.kitchenOrders || [];

  const handleCancel = (orderId, tableName) => {
    Alert.alert(
      'Hủy phiếu làm món',
      `Bạn muốn hủy phiếu order của ${tableName}?`,
      [
        { text: 'Quay lại', style: 'cancel' },
        { 
          text: 'Xác nhận hủy', 
          style: 'destructive',
          onPress: () => onCancelOrder(orderId) 
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Header bar */}
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>🍳 BẾP CHẾ BIẾN</Text>
        <View style={styles.statsPill}>
          <Text style={styles.statsText}>Đang chế biến: {activeOrders.length}</Text>
        </View>
      </View>

      {/* Cards list */}
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        {activeOrders.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🍳</Text>
            <Text style={styles.emptyTitle}>Bếp Nhàn Rỗi</Text>
            <Text style={styles.emptySubtitle}>Các đơn hàng gửi từ phục vụ sẽ xuất hiện tại đây.</Text>
          </View>
        ) : (
          <View style={styles.ticketsGrid}>
            {activeOrders.map(order => {
              const orderAgeMins = Math.floor((Date.now() - order.timestamp) / 60000);
              let cardBorderClass = styles.borderDefault;
              if (orderAgeMins >= 10) cardBorderClass = styles.borderCritical;
              else if (orderAgeMins >= 5) cardBorderClass = styles.borderWarning;

              return (
                <View key={order.id} style={[styles.ticketCard, cardBorderClass]}>
                  {/* Header */}
                  <View style={styles.ticketHeader}>
                    <View>
                      <Text style={styles.ticketTable}>📍 {order.tableName}</Text>
                      <Text style={styles.ticketTime}>Thời gian đặt: {order.time}</Text>
                    </View>
                    <TicketTimer timestamp={order.timestamp} />
                  </View>

                  {/* Body Items list */}
                  <View style={styles.ticketBody}>
                    {order.items.map((item, idx) => (
                      <TouchableOpacity 
                        key={idx} 
                        style={[styles.itemRow, item.completed && styles.itemRowCompleted]}
                        onPress={() => onToggleItem(order.id, idx)}
                      >
                        <View style={[styles.checkboxDot, item.completed && styles.checkboxDotChecked]}>
                          {item.completed && <Text style={styles.checkboxDotCheckedText}>✓</Text>}
                        </View>
                        <View style={styles.itemDetails}>
                          <Text style={[styles.itemName, item.completed && styles.textCompleted]}>
                            {item.name}
                          </Text>
                          {item.notes && item.notes.length > 0 && (
                            <Text style={[styles.itemNotes, item.completed && styles.textCompleted]}>
                              ↳ Ghi chú: {item.notes.join(', ')}
                            </Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Footer actions */}
                  <View style={styles.ticketFooter}>
                    <TouchableOpacity 
                      style={styles.btnCancel}
                      onPress={() => handleCancel(order.id, order.tableName)}
                    >
                      <Text style={styles.btnCancelText}>HỦY ĐƠN</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                      style={styles.btnComplete}
                      onPress={() => onCompleteOrder(order.id)}
                    >
                      <Text style={styles.btnCompleteText}>✓ HOÀN THÀNH</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1.5,
    borderBottomColor: '#e2e8f0',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: 0.3,
  },
  statsPill: {
    backgroundColor: '#eff6ff',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  statsText: {
    fontSize: 11,
    color: '#2563eb',
    fontWeight: '800',
  },
  scrollContainer: {
    padding: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 120,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
  },
  emptyIcon: {
    fontSize: 60,
    marginBottom: 16,
    opacity: 0.7,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    fontWeight: '600',
  },
  ticketsGrid: {
    gap: 16,
  },
  ticketCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  borderDefault: {
    borderTopWidth: 6,
    borderTopColor: '#3b82f6',
  },
  borderWarning: {
    borderTopWidth: 6,
    borderTopColor: '#f59e0b',
  },
  borderCritical: {
    borderTopWidth: 6,
    borderTopColor: '#ef4444',
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#f8fafc',
  },
  ticketTable: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
  },
  ticketTime: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
    fontWeight: '600',
  },
  timerContainer: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  timerOk: {
    backgroundColor: '#e2e8f0',
  },
  timerWarning: {
    backgroundColor: '#fef3c7',
  },
  timerCritical: {
    backgroundColor: '#fee2e2',
  },
  timerText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
  },
  ticketBody: {
    padding: 14,
    gap: 10,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
  },
  itemRowCompleted: {
    backgroundColor: '#f1f5f9',
  },
  checkboxDot: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxDotChecked: {
    backgroundColor: '#eff6ff',
    borderColor: '#2563eb',
  },
  checkboxDotCheckedText: {
    color: '#2563eb',
    fontSize: 13,
    fontWeight: '900',
  },
  itemDetails: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
  },
  itemNotes: {
    fontSize: 11,
    color: '#d97706',
    fontStyle: 'italic',
    marginTop: 2,
    fontWeight: '600',
  },
  textCompleted: {
    textDecorationLine: 'line-through',
    color: '#94a3b8',
  },
  ticketFooter: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  btnCancel: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fef2f2',
    borderRightWidth: 1,
    borderRightColor: '#f1f5f9',
  },
  btnCancelText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#ef4444',
    letterSpacing: 0.3,
  },
  btnComplete: {
    flex: 2,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
  },
  btnCompleteText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
});
