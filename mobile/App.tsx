import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, StatusBar, TouchableOpacity, SafeAreaView, ActivityIndicator, Vibration, Alert, PermissionsAndroid, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io } from 'socket.io-client';
import messaging from '@react-native-firebase/messaging';

import OrderScreen from './components/OrderScreen';
import KitchenScreen from './components/KitchenScreen';
import AdminScreen from './components/AdminScreen';
import ChatScreen from './components/ChatScreen';
import NoodleLoader from './components/NoodleLoader';

export default function App() {
  const [socketUrl, setSocketUrl] = useState('http://213.163.199.144');
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [activeTab, setActiveTab] = useState('order'); // 'order' | 'kitchen' | 'game' | 'admin'
  const [isLoading, setIsLoading] = useState(true);
  
  const [systemState, setSystemState] = useState({
    tables: {},
    menu: [],
    kitchenOrders: [],
    history: []
  });
  const [draftItems, setDraftItems] = useState({});
  const [fcmToken, setFcmToken] = useState('');
  const [activeBanner, setActiveBanner] = useState(null);

  const socketRef = useRef(null);
  const activeTabRef = useRef(activeTab);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  // Setup Firebase Messaging permissions and retrieve token on startup
  useEffect(() => {
    const setupFirebase = async () => {
      try {
        // Request Android 13+ Notification Permission explicitly
        if (Platform.OS === 'android' && Platform.Version >= 33) {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
          );
          console.log('Android POST_NOTIFICATIONS permission status:', granted);
        }

        const authStatus = await messaging().requestPermission();
        const enabled =
          authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
          authStatus === messaging.AuthorizationStatus.PROVISIONAL;

        if (enabled) {
          console.log('Firebase Authorization status:', authStatus);
          const token = await messaging().getToken();
          if (token) {
            console.log('FCM Token retrieved:', token);
            setFcmToken(token);
          }
        }
      } catch (err) {
        console.log('Firebase setup error:', err);
      }
    };

    setupFirebase();

    // Listen to foreground messages
    const unsubscribeMessage = messaging().onMessage(async remoteMessage => {
      console.log('A new FCM message arrived in foreground!', remoteMessage);
      Vibration.vibrate([0, 500, 200, 500]);
      
      // Show gorgeous sliding foreground banner
      setActiveBanner({
        title: remoteMessage.notification?.title || 'Thông báo mới',
        body: remoteMessage.notification?.body || ''
      });

      // Auto-hide banner after 4.5 seconds
      setTimeout(() => {
        setActiveBanner(null);
      }, 4500);
    });

    // Listen to token refresh
    const unsubscribeTokenRefresh = messaging().onTokenRefresh(token => {
      console.log('FCM Token refreshed:', token);
      setFcmToken(token);
    });

    return () => {
      unsubscribeMessage();
      unsubscribeTokenRefresh();
    };
  }, []);

  // Emit FCM Token to backend when connected and token is ready
  useEffect(() => {
    if (isConnected && socketRef.current && fcmToken) {
      console.log('Emitting register-fcm-token to server...');
      socketRef.current.emit('register-fcm-token', fcmToken);
    }
  }, [isConnected, fcmToken]);

  // Load socket URL from storage on startup
  useEffect(() => {
    const loadUrl = async () => {
      try {
        const savedUrl = await AsyncStorage.getItem('@server_socket_url');
        if (savedUrl) {
          setSocketUrl(savedUrl);
        } else {
          // If no custom URL is saved, make sure we use our default VPS URL
          setSocketUrl('http://213.163.199.144');
        }
      } catch (err) {
        console.error('AsyncStorage error:', err);
      } finally {
        setIsLoading(false);
      }
    };
    loadUrl();
  }, []);

  // Manage socket connection whenever socketUrl changes
  useEffect(() => {
    if (!socketUrl) return;

    // Disconnect old socket if exists
    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    console.log('Connecting to socket server:', socketUrl);
    const socket = io(socketUrl, {
      autoConnect: true
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      setConnectionError(null);
      console.log('Socket connected to:', socketUrl);
    });

    socket.on('connect_error', (err) => {
      setIsConnected(false);
      setConnectionError(err.message);
      console.log('Socket connection error:', err.message);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      console.log('Socket disconnected');
    });

    socket.on('state-update', (newState) => {
      console.log('State updated from server');
      setSystemState(newState);
    });

    socket.on('new-kitchen-order', ({ tableName }) => {
      console.log('New kitchen order received:', tableName);
      // Play high urgent vibration pattern
      Vibration.vibrate([0, 400, 150, 400]);
      
      // Play chime audio
      playMobileSound('new-order');
    });

    socket.on('order-served', ({ tableName }) => {
      console.log('Order served for table:', tableName);
      // Vibrate twice
      Vibration.vibrate([0, 200, 100, 200]);
      
      playMobileSound('served');

      // Show alert popup immediately on waiter screen, but hide it if we are currently looking at the kitchen screen
      if (activeTabRef.current !== 'kitchen') {
        Alert.alert('🔔 Đơn hàng hoàn thành', `${tableName} đã chế biến xong! Vui lòng giao món.`);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [socketUrl]);

  // Dynamic Audio player helper (sound assets can be integrated natively when building in unrestricted env)
  const playMobileSound = (type) => {
    console.log('Vibration triggered. Audio play skipped in sandboxed APK compile for type:', type);
  };

  // Connection config handler
  const handleSaveSocketUrl = async (newUrl) => {
    try {
      await AsyncStorage.setItem('@server_socket_url', newUrl);
      setSocketUrl(newUrl);
      setActiveTab('order');
      Alert.alert('Thành công', 'Đã lưu cấu hình kết nối mới!');
    } catch (err) {
      Alert.alert('Lỗi', 'Không thể lưu cấu hình kết nối.');
    }
  };

  // Socket emitters passed to children
  const handlePlaceOrder = (tableName, items) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('place-order', { tableName, items });
    } else {
      Alert.alert('Lỗi kết nối', 'Ứng dụng chưa kết nối đến server!');
    }
  };

  const handleClearTable = (tableName) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('clear-table', tableName);
    }
  };

  const handleCreateTakeaway = () => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('create-takeaway');
    }
  };

  const handleToggleKitchenItem = (orderId, itemIndex) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('toggle-kitchen-item', { orderId, itemIndex });
    }
  };

  const handleCompleteKitchenOrder = (orderId) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('complete-kitchen-order', orderId);
    }
  };

  const handleCancelKitchenOrder = (orderId) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('cancel-kitchen-order', orderId);
    }
  };

  const handleResetAll = () => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('reset-all');
    }
  };

  if (isLoading) {
    return (
      <NoodleLoader message="Đang nạp cấu hình Trung Tín..." />
    );
  }

  const activeTablesCount = Object.keys(systemState.tables || {}).filter(
    t => systemState.tables[t].items.length > 0
  ).length;
  const activeKitchenCount = systemState.kitchenOrders?.length || 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {/* Foreground In-App Floating Push Notification Banner */}
      {activeBanner && (
        <TouchableOpacity 
          style={styles.bannerContainer}
          activeOpacity={0.9}
          onPress={() => {
            if (activeBanner.title.toLowerCase().includes('bếp') || activeBanner.body.toLowerCase().includes('bếp')) {
              setActiveTab('kitchen');
            } else {
              setActiveTab('order');
            }
            setActiveBanner(null);
          }}
        >
          <View style={styles.bannerIconBox}>
            <Text style={{ fontSize: 20 }}>🍜</Text>
          </View>
          <View style={styles.bannerContent}>
            <Text style={styles.bannerTitle}>{activeBanner.title}</Text>
            <Text style={styles.bannerBody}>{activeBanner.body}</Text>
          </View>
          <TouchableOpacity style={styles.bannerClose} onPress={() => setActiveBanner(null)}>
            <Text style={styles.bannerCloseText}>✕</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      )}
      
      {/* Global Brand Header */}
      <View style={styles.appHeader}>
        <View>
          <Text style={styles.appTitle}>TRUNG TÍN POS 🍜</Text>
          <View style={styles.connectionIndicatorRow}>
            <View style={[styles.statusDot, isConnected ? styles.dotConnected : styles.dotDisconnected]} />
            <Text style={styles.statusText}>
              {isConnected ? 'Liên kết server hoạt động' : 'Mất kết nối server'}
            </Text>
          </View>
        </View>
        
        {/* Navigation Tab selection */}
        <View style={styles.navTabsContainer}>
          <TouchableOpacity 
            style={[styles.navTabBtn, activeTab === 'order' && styles.navTabBtnActive, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}
            onPress={() => setActiveTab('order')}
          >
            <Text style={[styles.navTabBtnText, activeTab === 'order' && styles.navTabBtnTextActive]}>
              PHỤC VỤ
            </Text>
            {activeTablesCount > 0 && (
              <View style={styles.tabBadgeMini}>
                <Text style={styles.tabBadgeMiniText}>{activeTablesCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.navTabBtn, activeTab === 'kitchen' && styles.navTabBtnActive, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}
            onPress={() => setActiveTab('kitchen')}
          >
            <Text style={[styles.navTabBtnText, activeTab === 'kitchen' && styles.navTabBtnTextActive]}>
              BẾP
            </Text>
            {activeKitchenCount > 0 && (
              <View style={[styles.tabBadgeMini, { backgroundColor: '#ef4444' }]}>
                <Text style={styles.tabBadgeMiniText}>{activeKitchenCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.navTabBtn, activeTab === 'social' && styles.navTabBtnActive]}
            onPress={() => setActiveTab('social')}
          >
            <Text style={[styles.navTabBtnText, activeTab === 'social' && styles.navTabBtnTextActive]}>
              TRÒ CHUYỆN
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.navTabBtn, activeTab === 'admin' && styles.navTabBtnActive]}
            onPress={() => setActiveTab('admin')}
          >
            <Text style={[styles.navTabBtnText, activeTab === 'admin' && styles.navTabBtnTextActive]}>
              CẤU HÌNH
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Primary tab screen views */}
      <View style={styles.mainContainer}>
        {activeTab === 'order' && (
          <OrderScreen
            state={systemState}
            onPlaceOrder={handlePlaceOrder}
            onClearTable={handleClearTable}
            onCreateTakeaway={handleCreateTakeaway}
            draftItems={draftItems}
            setDraftItems={setDraftItems}
          />
        )}

        {activeTab === 'kitchen' && (
          <KitchenScreen
            state={systemState}
            onToggleItem={handleToggleKitchenItem}
            onCompleteOrder={handleCompleteKitchenOrder}
            onCancelOrder={handleCancelKitchenOrder}
          />
        )}

        {activeTab === 'admin' && (
          <AdminScreen
            state={systemState}
            socketUrl={socketUrl}
            onSaveSocketUrl={handleSaveSocketUrl}
            onAddMenuItem={(name, price) => {
              if (socketRef.current) socketRef.current.emit('admin-add-menu-item', { name, price });
            }}
            onDeleteMenuItem={(id) => {
              if (socketRef.current) socketRef.current.emit('admin-delete-menu-item', id);
            }}
            onAddTable={(name) => {
              if (socketRef.current) socketRef.current.emit('admin-add-table', name);
            }}
            onDeleteTable={(name) => {
              if (socketRef.current) socketRef.current.emit('admin-delete-table', name);
            }}
            onAddQuickNote={(noteText) => {
              if (socketRef.current) socketRef.current.emit('admin-add-quick-note', noteText);
            }}
            onDeleteQuickNote={(noteText) => {
              if (socketRef.current) socketRef.current.emit('admin-delete-quick-note', noteText);
            }}
            onEditQuickNote={(oldNote, newNote) => {
              if (socketRef.current) socketRef.current.emit('admin-edit-quick-note', { oldNote, newNote });
            }}
            onResetAll={handleResetAll}
            connectionError={connectionError}
          />
        )}

        {activeTab === 'social' && (
          <ChatScreen
            socketUrl={socketUrl}
            fcmToken={fcmToken}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748b',
    fontWeight: '600',
  },
  appHeader: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1.5,
    borderBottomColor: '#1e293b',
    elevation: 4,
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
  },
  appTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 0.8,
  },
  connectionIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 14,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  dotConnected: {
    backgroundColor: '#10b981',
    shadowColor: '#10b981',
    shadowOpacity: 0.6,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 4,
  },
  dotDisconnected: {
    backgroundColor: '#ef4444',
    shadowColor: '#ef4444',
    shadowOpacity: 0.6,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 4,
  },
  statusText: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '700',
  },
  navTabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 3,
    gap: 4,
  },
  navTabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  navTabBtnActive: {
    backgroundColor: '#2563eb',
    elevation: 2,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
  },
  navTabBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 0.5,
  },
  navTabBtnTextActive: {
    color: '#ffffff',
  },
  tabBadgeMini: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabBadgeMiniText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '900',
  },
  bannerContainer: {
    position: 'absolute',
    top: 60,
    left: 12,
    right: 12,
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 9999,
    elevation: 10,
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  bannerIconBox: {
    marginRight: 12,
    backgroundColor: '#334155',
    padding: 8,
    borderRadius: 10,
  },
  bannerContent: {
    flex: 1,
  },
  bannerTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  bannerBody: {
    color: '#cbd5e1',
    fontSize: 12,
    marginTop: 2,
    fontWeight: '600',
  },
  bannerClose: {
    padding: 6,
    marginLeft: 8,
  },
  bannerCloseText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '800',
  },
  mainContainer: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
});
