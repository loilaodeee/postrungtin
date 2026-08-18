import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  Linking
} from 'react-native';
import io from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { launchImageLibrary } from 'react-native-image-picker';

const STICKERS = [
  { code: '🍜', label: 'Hủ tiếu' },
  { code: '🥟', label: 'Sủi cảo' },
  { code: '🍢', label: 'Xiên que' },
  { code: '🥤', label: 'Trà sữa' },
  { code: '🍦', label: 'Kem' },
  { code: '🍰', label: 'Bánh ngọt' },
  { code: '🍺', label: 'Bia' },
  { code: '🍟', label: 'Khoai tây' }
];

const EMOJIS = ['😀', '😂', '😍', '👍', '🎉', '🍜', '🥟', '🥤', '🔥', '❤️', '👏', '😭'];

export default function ChatScreen({ socketUrl, fcmToken }) {
  const [token, setToken] = useState('');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Auth Form State
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Lists & Messaging State
  const [friends, setFriends] = useState([]);
  const [pendingIncoming, setPendingIncoming] = useState([]);
  const [pendingOutgoing, setPendingOutgoing] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [activeFriend, setActiveFriend] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [friendTyping, setFriendTyping] = useState(false);
  const [localTyping, setLocalTyping] = useState(false);

  // Panels
  const [showEmojiPanel, setShowEmojiPanel] = useState(false);
  const [showStickerPanel, setShowStickerPanel] = useState(false);
  
  // Lightbox Modal state
  const [activeLightboxImg, setActiveLightboxImg] = useState<string | null>(null);

  const socketRef = useRef(null);
  const flatListRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const CHAT_SERVER_URL = useMemo(() => {
    return `${socketUrl}/chat`;
  }, [socketUrl]);

  // Load Saved Auth on Mount
  useEffect(() => {
    const loadAuth = async () => {
      try {
        const savedToken = await AsyncStorage.getItem('chatToken');
        const savedUser = await AsyncStorage.getItem('chatUser');
        if (savedToken && savedUser) {
          setToken(savedToken);
          setUser(JSON.parse(savedUser));
        }
      } catch (err) {
        console.error('AsyncStorage load auth error:', err);
      } finally {
        setLoading(false);
      }
    };
    loadAuth();
  }, []);

  // Socket Connection and Event Listeners
  useEffect(() => {
    if (!token) return;

    const socket = io(CHAT_SERVER_URL, {
      auth: { token }
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to Chat Socket Server');
      if (fcmToken) {
        socket.emit('register-fcm-token', fcmToken);
      }
    });

    socket.on('private-message', (msg) => {
      const isFromActiveFriend = activeFriend && msg.sender_id === activeFriend.id;
      const isSentByMe = msg.sender_id === user.id;

      if (isFromActiveFriend || isSentByMe) {
        setMessages((prev) => [...prev, msg]);
        if (isFromActiveFriend) {
          markMessagesAsRead(activeFriend.id);
        }
      }
      fetchFriendsList();
    });

    socket.on('typing', ({ senderId }) => {
      if (activeFriend && senderId === activeFriend.id) {
        setFriendTyping(true);
      }
    });

    socket.on('stop-typing', ({ senderId }) => {
      if (activeFriend && senderId === activeFriend.id) {
        setFriendTyping(false);
      }
    });

    socket.on('user-status-change', ({ userId, status }) => {
      setFriends((prev) =>
        prev.map((f) => (f.id === userId ? { ...f, status } : f))
      );
    });

    socket.on('friend-request-received', () => {
      fetchFriendsList();
    });

    socket.on('friend-request-accepted', () => {
      fetchFriendsList();
    });

    socket.on('messages-read', ({ readerId }) => {
      if (activeFriend && readerId === activeFriend.id) {
        setMessages((prev) =>
          prev.map((m) => (m.receiver_id === readerId ? { ...m, is_read: true } : m))
        );
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [token, activeFriend, fcmToken, CHAT_SERVER_URL]);

  // Load friends list when token changes
  useEffect(() => {
    if (token) {
      fetchFriendsList();
    }
  }, [token]);

  // Load message history when active chat partner changes
  useEffect(() => {
    if (activeFriend) {
      fetchMessageHistory();
      markMessagesAsRead(activeFriend.id);
      setFriendTyping(false);
      setShowEmojiPanel(false);
      setShowStickerPanel(false);
    } else {
      setMessages([]);
    }
  }, [activeFriend]);

  // REST API: Mark as read
  const markMessagesAsRead = async (friendId) => {
    try {
      await fetch(`${CHAT_SERVER_URL}/messages/read`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ friendId })
      });
    } catch (err) {
      console.error('Error marking read on mobile:', err);
    }
  };

  // REST API: Get friends
  const fetchFriendsList = async () => {
    try {
      const res = await fetch(`${CHAT_SERVER_URL}/friends/list`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!data.error) {
        setFriends(data.friends || []);
        setPendingIncoming(data.pendingIncoming || []);
        setPendingOutgoing(data.pendingOutgoing || []);
      }
    } catch (err) {
      console.error('Fetch friends list error:', err);
    }
  };

  // REST API: Get chat message history
  const fetchMessageHistory = async () => {
    if (!activeFriend) return;
    try {
      const res = await fetch(`${CHAT_SERVER_URL}/messages/history/${activeFriend.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!data.error) {
        setMessages(data);
        fetchFriendsList(); // Refresh friends list to clear unread counts locally
      }
    } catch (err) {
      console.error('Fetch message history error:', err);
    }
  };

  // Auth: Submit Login / Register
  const handleAuth = async () => {
    if (!username.trim() || !password.trim() || (isRegister && !displayName.trim())) {
      Alert.alert('Lỗi', 'Vui lòng điền đầy đủ thông tin!');
      return;
    }

    setAuthLoading(true);
    const endpoint = isRegister ? '/auth/register' : '/auth/login';
    const payload = isRegister
      ? { username: username.trim().toLowerCase(), password, display_name: displayName.trim() }
      : { username: username.trim().toLowerCase(), password };

    try {
      const res = await fetch(`${CHAT_SERVER_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.error) {
        Alert.alert('Thất bại', data.error);
        setAuthLoading(false);
        return;
      }

      await AsyncStorage.setItem('chatToken', data.token);
      await AsyncStorage.setItem('chatUser', JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);

      setUsername('');
      setPassword('');
      setDisplayName('');
    } catch (err) {
      Alert.alert('Lỗi kết nối', 'Không thể kết nối đến Chat Server!');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Đăng xuất', 'Bạn có chắc chắn muốn đăng xuất tài khoản trò chuyện?', [
      { text: 'Quay lại', style: 'cancel' },
      {
        text: 'Đăng xuất',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem('chatToken');
          await AsyncStorage.removeItem('chatUser');
          setToken('');
          setUser(null);
          setActiveFriend(null);
          setFriends([]);
        }
      }
    ]);
  };

  // Friendship: Search user profiles
  const handleSearchUsers = async (text) => {
    setSearchQuery(text);
    if (!text.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      const res = await fetch(`${CHAT_SERVER_URL}/users/search?query=${encodeURIComponent(text)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!data.error) {
        setSearchResults(data);
      }
    } catch (err) {
      console.error('Search user profiles error:', err);
    }
  };

  // Friendship: Send friend request
  const handleSendRequest = async (friendId) => {
    try {
      const res = await fetch(`${CHAT_SERVER_URL}/friends/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ friendId })
      });
      const data = await res.json();
      if (data.error) {
        Alert.alert('Lỗi', data.error);
      } else {
        Alert.alert('Thành công', 'Đã gửi lời mời kết bạn!');
        setSearchQuery('');
        setSearchResults([]);
        fetchFriendsList();
      }
    } catch (err) {
      console.error('Friend request error:', err);
    }
  };

  // Friendship: Accept friend request
  const handleAcceptRequest = async (friendId) => {
    try {
      const res = await fetch(`${CHAT_SERVER_URL}/friends/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ friendId })
      });
      const data = await res.json();
      if (data.error) {
        Alert.alert('Lỗi', data.error);
      } else {
        fetchFriendsList();
      }
    } catch (err) {
      console.error('Accept request error:', err);
    }
  };

  // Friendship: Delete friendship
  const handleDeleteFriend = async (friendId, name) => {
    Alert.alert('Hủy kết bạn', `Bạn có chắc muốn hủy kết bạn/hủy lời mời với ${name}?`, [
      { text: 'Quay lại', style: 'cancel' },
      {
        text: 'Hủy kết bạn',
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await fetch(`${CHAT_SERVER_URL}/friends/delete`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify({ friendId })
            });
            const data = await res.json();
            if (!data.error) {
              if (activeFriend && activeFriend.id === friendId) {
                setActiveFriend(null);
              }
              fetchFriendsList();
            }
          } catch (err) {
            console.error('Delete friendship error:', err);
          }
        }
      }
    ]);
  };

  // Messaging: typing triggers
  const handleTyping = (text) => {
    setInputText(text);
    if (!socketRef.current || !activeFriend) return;

    if (!localTyping) {
      setLocalTyping(true);
      socketRef.current.emit('typing', { receiverId: activeFriend.id });
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setLocalTyping(false);
      socketRef.current.emit('stop-typing', { receiverId: activeFriend.id });
    }, 1500);
  };

  // Messaging: Send text message
  const handleSendMessage = () => {
    if (!inputText.trim() || !activeFriend || !socketRef.current) return;

    socketRef.current.emit('private-message', {
      receiverId: activeFriend.id,
      content: inputText.trim(),
      media_type: 'text'
    });

    const echoMsg = {
      id: Date.now().toString(),
      sender_id: user.id,
      receiver_id: activeFriend.id,
      content: inputText.trim(),
      media_type: 'text',
      created_at: new Date().toISOString()
    };
    setMessages((prev) => [...prev, echoMsg]);

    setInputText('');
    setLocalTyping(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    socketRef.current.emit('stop-typing', { receiverId: activeFriend.id });
  };

  // Messaging: Send Sticker
  const handleSendSticker = (stickerCode) => {
    if (!activeFriend || !socketRef.current) return;

    socketRef.current.emit('private-message', {
      receiverId: activeFriend.id,
      content: stickerCode,
      media_type: 'sticker'
    });

    const echoMsg = {
      id: Date.now().toString(),
      sender_id: user.id,
      receiver_id: activeFriend.id,
      content: stickerCode,
      media_type: 'sticker',
      created_at: new Date().toISOString()
    };
    setMessages((prev) => [...prev, echoMsg]);
    setShowStickerPanel(false);
  };

  // Select media from phone gallery using system Photo Picker (no scary permissions required!)
  const handleSelectMedia = () => {
    const options = {
      mediaType: 'mixed', // allows both images and videos
      selectionLimit: 0, // 0 allows selecting multiple files
      quality: 0.8
    };

    launchImageLibrary(options, async (response) => {
      if (response.didCancel) {
        console.log('User cancelled media picker');
        return;
      }
      if (response.errorCode) {
        Alert.alert('Lỗi', response.errorMessage || 'Lỗi mở thư viện ảnh');
        return;
      }
      if (response.assets && response.assets.length > 0) {
        uploadMobileFiles(response.assets);
      }
    });
  };

  const uploadMobileFiles = async (assets) => {
    for (const asset of assets) {
      const isVideo = asset.type?.startsWith('video/') || asset.uri?.endsWith('.mp4') || asset.uri?.endsWith('.mov');
      const mediaType = isVideo ? 'video' : 'image';

      const tempId = Date.now().toString() + Math.random().toString();
      
      // Local preview message with loading indicator
      const tempMsg = {
        id: tempId,
        sender_id: user.id,
        receiver_id: activeFriend.id,
        content: asset.uri, // Local preview path
        media_type: mediaType,
        created_at: new Date().toISOString(),
        loading: true
      };

      setMessages((prev) => [...prev, tempMsg]);

      const formData = new FormData();
      formData.append('file', {
        uri: Platform.OS === 'android' ? asset.uri : asset.uri.replace('file://', ''),
        type: asset.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
        name: asset.fileName || (isVideo ? 'video.mp4' : 'image.jpg')
      });

      try {
        const res = await fetch(`${CHAT_SERVER_URL}/upload`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          },
          body: formData
        });
        const data = await res.json();

        if (data.error) {
          Alert.alert('Gửi thất bại', data.error);
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          continue;
        }

        if (data.fileUrl) {
          socketRef.current.emit('private-message', {
            receiverId: activeFriend.id,
            content: data.fileUrl,
            media_type: mediaType
          });

          // Replace temp message with server url and remove loading state
          setMessages((prev) =>
            prev.map((m) =>
              m.id === tempId ? { ...m, content: data.fileUrl, loading: false } : m
            )
          );
        }
      } catch (err) {
        console.error('File upload error on mobile:', err);
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        Alert.alert('Lỗi', 'Lỗi kết nối khi tải lên tệp tin!');
      }
    }
  };

  // Activity Status Formatting
  const formatActivityStatus = (friend) => {
    if (friend.status === 'online') {
      return '🟢 Đang hoạt động';
    }
    if (!friend.last_seen) {
      return '⚫ Ngoại tuyến';
    }
    
    const diffMs = Date.now() - new Date(friend.last_seen).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return '⚫ Vừa hoạt động';
    if (diffMins < 60) return `⚫ Hoạt động ${diffMins} phút trước`;
    if (diffHours < 24) return `⚫ Hoạt động ${diffHours} giờ trước`;
    return `⚫ Hoạt động ${diffDays} ngày trước`;
  };

  // Message Preview Formatting
  const renderLastMessagePreview = (friend) => {
    const lm = friend.last_message;
    if (!lm) return 'Hãy bắt đầu trò chuyện';

    const isSelf = lm.sender_id === user.id;
    const prefix = isSelf ? 'Bạn: ' : '';
    
    let contentPreview = lm.content;
    if (lm.media_type === 'image') contentPreview = '📷 Đã gửi một ảnh';
    else if (lm.media_type === 'video') contentPreview = '🎥 Đã gửi một video';
    else if (lm.media_type === 'sticker') contentPreview = `🥟 Sticker ${lm.content}`;

    if (contentPreview.length > 20) {
      contentPreview = contentPreview.substring(0, 20) + '...';
    }

    return `${prefix}${contentPreview}`;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  // ----------------------------------------------------
  // RENDER AUTH SCREEN
  // ----------------------------------------------------
  if (!token || !user) {
    return (
      <KeyboardAvoidingView
        style={styles.authContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.authCard}>
          <Text style={styles.authTitle}>✨ Tín Trung Trung Tình</Text>
          <Text style={styles.authSubtitle}>Chat Online</Text>

          {isRegister && (
            <TextInput
              style={styles.authInput}
              placeholder="Tên hiển thị (Ví dụ: Lợi đẹp trai, Tín độc thân)"
              placeholderTextColor="#94a3b8"
              value={displayName}
              onChangeText={setDisplayName}
            />
          )}

          <TextInput
            style={styles.authInput}
            placeholder="Tên đăng nhập"
            placeholderTextColor="#94a3b8"
            autoCapitalize="none"
            value={username}
            onChangeText={setUsername}
          />

          <TextInput
            style={styles.authInput}
            placeholder="Mật khẩu"
            placeholderTextColor="#94a3b8"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <TouchableOpacity style={styles.btnAuth} onPress={handleAuth} disabled={authLoading}>
            {authLoading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.btnAuthText}>
                {isRegister ? 'ĐĂNG KÝ TÀI KHOẢN' : 'ĐĂNG NHẬP'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.btnToggleAuth}
            onPress={() => setIsRegister(!isRegister)}
          >
            <Text style={styles.btnToggleAuthText}>
              {isRegister ? 'Đã có tài khoản? Đăng nhập ngay' : 'Chưa có tài khoản? Đăng ký ngay'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ----------------------------------------------------
  // RENDER MAIN SCREEN & CHAT MODAL
  // ----------------------------------------------------
  return (
    <View style={styles.container}>
      {/* 1. Header Profile Box */}
      <View style={styles.profileHeader}>
        <View>
          <Text style={styles.profileName}>{user.display_name}</Text>
          <Text style={styles.profileUsername}>@{user.username}</Text>
        </View>
        <TouchableOpacity style={styles.btnLogout} onPress={handleLogout}>
          <Text style={styles.btnLogoutText}>Đăng xuất</Text>
        </TouchableOpacity>
      </View>

      {/* 2. User search bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Tìm tên đăng nhập để kết bạn..."
          placeholderTextColor="#94a3b8"
          value={searchQuery}
          onChangeText={handleSearchUsers}
        />
        {searchResults.length > 0 && (
          <View style={styles.searchResultsBox}>
            {searchResults.map((usr) => {
              const isFriend = friends.some((f) => f.id === usr.id);
              const isPendingIn = pendingIncoming.some((f) => f.id === usr.id);
              const isPendingOut = pendingOutgoing.some((f) => f.id === usr.id);

              return (
                <View key={usr.id} style={styles.searchResultRow}>
                  <View>
                    <Text style={styles.resultName}>{usr.display_name}</Text>
                    <Text style={styles.resultUsername}>@{usr.username}</Text>
                  </View>
                  {isFriend ? (
                    <Text style={[styles.badgeText, { color: '#10b981' }]}>Bạn bè</Text>
                  ) : isPendingOut ? (
                    <Text style={[styles.badgeText, { color: '#f59e0b' }]}>Đã gửi</Text>
                  ) : isPendingIn ? (
                    <TouchableOpacity
                      style={styles.btnAcceptMini}
                      onPress={() => handleAcceptRequest(usr.id)}
                    >
                      <Text style={styles.btnAcceptMiniText}>Nhận</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.btnConnectMini}
                      onPress={() => handleSendRequest(usr.id)}
                    >
                      <Text style={styles.btnConnectMiniText}>Kết bạn</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* 3. Friend Lists Area */}
      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
        {/* Incoming Friend requests list */}
        {pendingIncoming.length > 0 && (
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>Lời mời kết bạn ({pendingIncoming.length})</Text>
            {pendingIncoming.map((req) => (
              <View key={req.id} style={styles.requestRow}>
                <Text style={styles.requestName}>{req.display_name}</Text>
                <View style={styles.requestActions}>
                  <TouchableOpacity
                    style={styles.btnRequestAccept}
                    onPress={() => handleAcceptRequest(req.id)}
                  >
                    <Text style={styles.btnRequestAcceptText}>Đồng ý</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.btnRequestReject}
                    onPress={() => handleDeleteFriend(req.id, req.display_name)}
                  >
                    <Text style={styles.btnRequestRejectText}>Từ chối</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Friends list */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Bạn bè trò chuyện ({friends.length})</Text>
          {friends.length === 0 ? (
            <Text style={styles.emptyText}>
              Chưa có bạn bè nào. Hãy gõ tên đăng nhập ở trên để kết bạn kết nối nhé!
            </Text>
          ) : (
            friends.map((friend) => {
              const isOnline = friend.status === 'online';
              const hasUnread = friend.unread_count > 0;

              return (
                <TouchableOpacity
                  key={friend.id}
                  style={[styles.friendRow, hasUnread && styles.friendRowUnread]}
                  onPress={() => setActiveFriend(friend)}
                >
                  <View style={styles.friendLeft}>
                    <View style={styles.avatarPlaceholder}>
                      <Text style={styles.avatarLetter}>
                        {friend.display_name.charAt(0).toUpperCase()}
                      </Text>
                      <View style={[styles.statusIndicator, isOnline ? styles.onlineDot : styles.offlineDot]} />
                    </View>
                    <View style={{ overflow: 'hidden', width: '65%' }}>
                      <Text style={[styles.friendName, hasUnread && styles.friendNameUnread]}>
                        {friend.display_name}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={[styles.friendStatusText, hasUnread && styles.friendPreviewUnread]}
                      >
                        {renderLastMessagePreview(friend)}
                      </Text>
                      <Text style={styles.friendStatusTextTime}>
                        {formatActivityStatus(friend)}
                      </Text>
                    </View>
                  </View>
                  
                  <View style={styles.friendRowRight}>
                    {hasUnread && (
                      <View style={styles.unreadCountBadge}>
                        <Text style={styles.unreadCountBadgeText}>{friend.unread_count}</Text>
                      </View>
                    )}
                    <TouchableOpacity
                      style={{ padding: 6 }}
                      onPress={() => handleDeleteFriend(friend.id, friend.display_name)}
                    >
                      <Text style={{ color: '#ef4444', fontSize: 11, fontWeight: '700' }}>Hủy</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* 4. CHAT ROOM FULL SCREEN MODAL */}
      <Modal
        visible={!!activeFriend}
        animationType="slide"
        onRequestClose={() => setActiveFriend(null)}
      >
        {activeFriend && (
          <KeyboardAvoidingView
            style={styles.chatRoomContainer}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
          >
            {/* Header */}
            <View style={styles.chatHeader}>
              <TouchableOpacity style={styles.btnBack} onPress={() => setActiveFriend(null)}>
                <Text style={styles.btnBackText}>◀ Quay lại</Text>
              </TouchableOpacity>
              <View style={{ alignItems: 'center' }}>
                <Text style={styles.chatPartnerName}>{activeFriend.display_name}</Text>
                <Text style={styles.chatPartnerStatus}>
                  {formatActivityStatus(activeFriend)}
                </Text>
              </View>
              <View style={{ width: 60 }} />
            </View>

            {/* Message Area */}
            {(() => {
              const lastSentIndex = (() => {
                for (let i = messages.length - 1; i >= 0; i--) {
                  if (messages[i].sender_id === user.id) {
                    return i;
                  }
                }
                return -1;
              })();

              return (
                <FlatList
                  ref={flatListRef}
                  style={styles.chatList}
                  data={messages}
                  keyExtractor={(item) => item.id}
                  onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                  onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
                  renderItem={({ item, index }) => {
                    const isSelf = item.sender_id === user.id;
                    const time = new Date(item.created_at).toLocaleTimeString('vi-VN', {
                      hour: '2-digit',
                      minute: '2-digit'
                    });

                    const isSticker = item.media_type === 'sticker';
                    
                    const renderMobileBubbleContent = () => {
                      const absoluteUrl = item.content.startsWith('http') || item.content.startsWith('file:') || item.content.startsWith('content:')
                        ? item.content
                        : `${CHAT_SERVER_URL.replace('/chat', '')}${item.content}`;

                      if (item.media_type === 'image') {
                        return (
                          <TouchableOpacity activeOpacity={0.9} onPress={() => setActiveLightboxImg(absoluteUrl)}>
                            <View style={{ position: 'relative' }}>
                              <Image
                                source={{ uri: absoluteUrl }}
                                style={styles.chatImageMedia}
                                resizeMode="cover"
                              />
                              {item.loading && (
                                <View style={styles.mediaSpinnerOverlay}>
                                  <ActivityIndicator size="small" color="#ffffff" />
                                </View>
                              )}
                            </View>
                          </TouchableOpacity>
                        );
                      }
                      if (item.media_type === 'video') {
                        return (
                          <TouchableOpacity activeOpacity={0.8} onPress={() => !item.loading && Linking.openURL(absoluteUrl)}>
                            <View style={[styles.videoBubblePlaceholder, item.loading && styles.videoBubbleLoading]}>
                              <Text style={styles.videoText}>
                                {item.loading ? '⏳ Đang tải video...' : '🎥 Video (Chạm để phát)'}
                              </Text>
                              {item.loading ? (
                                <ActivityIndicator size="small" color="#2563eb" style={{ marginLeft: 8 }} />
                              ) : null}
                            </View>
                          </TouchableOpacity>
                        );
                      }
                      if (item.media_type === 'sticker') {
                        return <Text style={styles.chatStickerMedia}>{item.content}</Text>;
                      }
                      return (
                        <Text style={[styles.bubbleText, isSelf ? styles.selfText : styles.otherText]}>
                          {item.content}
                        </Text>
                      );
                    };

                    return (
                      <View style={[styles.bubbleWrapper, isSelf ? styles.selfWrapper : styles.otherWrapper]}>
                        <View style={[styles.bubbleContainerAlign, isSelf ? styles.alignRight : styles.alignLeft]}>
                          <View style={[
                            styles.bubble,
                            isSelf ? styles.selfBubble : styles.otherBubble,
                            isSticker && styles.stickerBubbleStyle
                          ]}>
                            {renderMobileBubbleContent()}
                            {!isSticker && (
                              <Text style={[styles.bubbleTime, isSelf ? styles.selfTime : styles.otherTime]}>
                                {time}
                              </Text>
                            )}
                          </View>
                          {index === lastSentIndex && !item.loading && (
                            <Text style={styles.statusText}>
                              {item.is_read ? 'Đã xem' : 'Đã gửi'}
                            </Text>
                          )}
                        </View>
                      </View>
                    );
                  }}
                  ListEmptyComponent={
                    <View style={styles.chatEmptyBox}>
                      <Text style={styles.chatEmptyText}>
                        Hãy bắt đầu gửi tin nhắn trao đổi với {activeFriend.display_name}!
                      </Text>
                    </View>
                  }
                />
              );
            })()}

            {/* Emojis list panel */}
            {showEmojiPanel && (
              <View style={styles.panelContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingVertical: 10 }}>
                  {EMOJIS.map((emoji) => (
                    <TouchableOpacity
                      key={emoji}
                      style={styles.panelItemBtn}
                      onPress={() => {
                        setInputText((prev) => prev + emoji);
                        setShowEmojiPanel(false);
                      }}
                    >
                      <Text style={{ fontSize: 24 }}>{emoji}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Stickers list panel */}
            {showStickerPanel && (
              <View style={styles.panelContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingVertical: 10 }}>
                  {STICKERS.map((stk) => (
                    <TouchableOpacity
                      key={stk.code}
                      style={styles.panelStickerBtn}
                      onPress={() => handleSendSticker(stk.code)}
                    >
                      <Text style={{ fontSize: 32, textAlign: 'center' }}>{stk.code}</Text>
                      <Text style={{ fontSize: 9, color: '#64748b', fontWeight: 'bold', marginTop: 4 }}>
                        {stk.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Lightbox full-screen image preview */}
            <Modal
              visible={!!activeLightboxImg}
              transparent={true}
              animationType="fade"
              onRequestClose={() => setActiveLightboxImg(null)}
            >
              <View style={styles.lightboxBackdrop}>
                <TouchableOpacity style={styles.lightboxCloseBtn} onPress={() => setActiveLightboxImg(null)}>
                  <Text style={styles.lightboxCloseText}>✕</Text>
                </TouchableOpacity>
                {activeLightboxImg && (
                  <Image
                    source={{ uri: activeLightboxImg }}
                    style={styles.lightboxImage}
                    resizeMode="contain"
                  />
                )}
              </View>
            </Modal>

            {/* Typing status indicator */}
            {friendTyping && (
              <View style={styles.typingIndicatorBox}>
                <Text style={styles.typingIndicatorText}>{activeFriend.display_name} đang soạn tin...</Text>
              </View>
            )}

            {/* Input bar */}
            <View style={styles.chatInputBar}>
              <View style={styles.mediaRowActions}>
                {/* Emoji toggle */}
                <TouchableOpacity
                  style={styles.btnActionRound}
                  onPress={() => {
                    setShowEmojiPanel(!showEmojiPanel);
                    setShowStickerPanel(false);
                  }}
                >
                  <Text style={{ fontSize: 16 }}>😀</Text>
                </TouchableOpacity>

                {/* Sticker toggle */}
                <TouchableOpacity
                  style={styles.btnActionRound}
                  onPress={() => {
                    setShowStickerPanel(!showStickerPanel);
                    setShowEmojiPanel(false);
                  }}
                >
                  <Text style={{ fontSize: 16 }}>🍜</Text>
                </TouchableOpacity>

                {/* Media picker from Gallery (Images & Videos) */}
                <TouchableOpacity
                  style={styles.btnActionRound}
                  onPress={handleSelectMedia}
                >
                  <Text style={{ fontSize: 16 }}>📷</Text>
                </TouchableOpacity>
              </View>

              <TextInput
                style={styles.chatInput}
                placeholder="Nhập tin nhắn..."
                placeholderTextColor="#94a3b8"
                value={inputText}
                onChangeText={handleTyping}
              />
              <TouchableOpacity
                style={[styles.btnSend, !inputText.trim() && styles.btnSendDisabled]}
                onPress={handleSendMessage}
                disabled={!inputText.trim()}
              >
                <Text style={[styles.btnSendText, !inputText.trim() && styles.btnSendTextDisabled]}>Gửi</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff'
  },
  authContainer: {
    flex: 1,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  authCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    elevation: 4,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10
  },
  authTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#1e3a8a',
    textAlign: 'center',
    marginBottom: 6
  },
  authSubtitle: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24
  },
  authInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
    marginBottom: 12
  },
  btnAuth: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8
  },
  btnAuthText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14
  },
  btnToggleAuth: {
    alignItems: 'center',
    marginTop: 16
  },
  btnToggleAuthText: {
    color: '#2563eb',
    fontSize: 12,
    fontWeight: '600',
    textDecorationLine: 'underline'
  },
  profileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0'
  },
  profileName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a'
  },
  profileUsername: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2
  },
  btnLogout: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#fee2e2'
  },
  btnLogoutText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '700'
  },
  searchContainer: {
    padding: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    position: 'relative',
    zIndex: 99
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#0f172a',
    backgroundColor: '#f8fafc'
  },
  searchResultsBox: {
    position: 'absolute',
    top: 50,
    left: 12,
    right: 12,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 3,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    maxHeight: 180,
    overflow: 'scroll'
  },
  searchResultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  resultName: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0f172a'
  },
  resultUsername: {
    fontSize: 11,
    color: '#64748b'
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700'
  },
  btnConnectMini: {
    backgroundColor: '#2563eb',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6
  },
  btnConnectMiniText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold'
  },
  btnAcceptMini: {
    backgroundColor: '#dcfce7',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6
  },
  btnAcceptMiniText: {
    color: '#15803d',
    fontSize: 11,
    fontWeight: 'bold'
  },
  sectionContainer: {
    padding: 16
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8
  },
  requestRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fffbeb',
    borderColor: '#fef3c7',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8
  },
  requestName: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#78350f'
  },
  requestActions: {
    flexDirection: 'row',
    gap: 8
  },
  btnRequestAccept: {
    backgroundColor: '#10b981',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6
  },
  btnRequestAcceptText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold'
  },
  btnRequestReject: {
    backgroundColor: '#ef4444',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6
  },
  btnRequestRejectText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold'
  },
  friendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#f1f5f9'
  },
  friendRowUnread: {
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff'
  },
  friendRowRight: {
    alignItems: 'flex-end',
    gap: 6
  },
  unreadCountBadge: {
    backgroundColor: '#2563eb',
    borderRadius: 9,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center'
  },
  unreadCountBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold'
  },
  friendLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative'
  },
  avatarLetter: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#475569'
  },
  statusIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#ffffff'
  },
  onlineDot: {
    backgroundColor: '#10b981'
  },
  offlineDot: {
    backgroundColor: '#94a3b8'
  },
  friendName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a'
  },
  friendNameUnread: {
    fontWeight: '900',
    color: '#1e3a8a'
  },
  friendPreviewUnread: {
    fontWeight: 'bold',
    color: '#2563eb'
  },
  friendStatusText: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2
  },
  friendStatusTextTime: {
    fontSize: 9,
    color: '#94a3b8',
    marginTop: 2,
    fontWeight: '600'
  },
  emptyText: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 20
  },
  chatRoomContainer: {
    flex: 1,
    backgroundColor: '#f1f5f9'
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0'
  },
  btnBack: {
    padding: 8
  },
  btnBackText: {
    color: '#2563eb',
    fontSize: 13,
    fontWeight: 'bold'
  },
  chatPartnerName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0f172a'
  },
  chatPartnerStatus: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2
  },
  chatList: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f8fafc'
  },
  bubbleWrapper: {
    flexDirection: 'row',
    width: '100%',
    marginBottom: 8
  },
  selfWrapper: {
    justifyContent: 'flex-end'
  },
  otherWrapper: {
    justifyContent: 'flex-start'
  },
  bubble: {
    maxWidth: '70%',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 18
  },
  selfBubble: {
    backgroundColor: '#0084ff'
  },
  otherBubble: {
    backgroundColor: '#e4e6eb'
  },
  stickerBubbleStyle: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    padding: 0
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 18
  },
  selfText: {
    color: '#ffffff'
  },
  otherText: {
    color: '#0f172a'
  },
  chatImageMedia: {
    width: 200,
    height: 160,
    borderRadius: 10
  },
  chatStickerMedia: {
    fontSize: 48
  },
  bubbleTime: {
    fontSize: 9,
    marginTop: 4,
    textAlign: 'right',
    opacity: 0.6
  },
  selfTime: {
    color: '#ffffff'
  },
  otherTime: {
    color: '#64748b'
  },
  chatEmptyBox: {
    paddingVertical: 100,
    alignItems: 'center',
    justifyContent: 'center'
  },
  chatEmptyText: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 20
  },
  typingIndicatorBox: {
    paddingHorizontal: 16,
    paddingVertical: 8
  },
  typingIndicatorText: {
    fontSize: 11,
    fontStyle: 'italic',
    color: '#64748b'
  },
  chatInputBar: {
    flexDirection: 'row',
    padding: 10,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    alignItems: 'center',
    gap: 8
  },
  chatInput: {
    flex: 1,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#f1f5f9'
  },
  mediaRowActions: {
    flexDirection: 'row',
    gap: 6
  },
  btnActionRound: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center'
  },
  btnSend: {
    backgroundColor: '#0084ff',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center'
  },
  btnSendDisabled: {
    backgroundColor: '#e2e8f0'
  },
  btnSendText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 13
  },
  btnSendTextDisabled: {
    color: '#94a3b8'
  },
  panelContainer: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingHorizontal: 12
  },
  panelItemBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  panelStickerBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    alignItems: 'center'
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  modalCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    elevation: 5
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 16
  },
  typeSelectorRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center'
  },
  typeBtnActive: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff'
  },
  typeBtnText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '700'
  },
  typeBtnTextActive: {
    color: '#2563eb'
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    color: '#0f172a',
    marginBottom: 16
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8
  },
  btnModalAction: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6
  },
  mediaSpinnerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10
  },
  videoBubblePlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16
  },
  videoBubbleLoading: {
    backgroundColor: '#f8fafc'
  },
  videoText: {
    fontSize: 13,
    color: '#2563eb',
    fontWeight: 'bold'
  },
  bubbleContainerAlign: {
    flexDirection: 'column'
  },
  alignRight: {
    alignItems: 'flex-end'
  },
  alignLeft: {
    alignItems: 'flex-start'
  },
  statusText: {
    fontSize: 9,
    color: '#64748b',
    marginTop: 2,
    fontWeight: '700',
    opacity: 0.8
  },
  lightboxBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  lightboxCloseBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999
  },
  lightboxCloseText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold'
  },
  lightboxImage: {
    width: '100%',
    height: '100%'
  }
});
