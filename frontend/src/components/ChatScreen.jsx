import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Send, Image, Film, Smile, LogOut, MessageSquare, Sparkles, User, Check, X, FileText, Search } from 'lucide-react';

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

export default function ChatScreen() {
  const [token, setToken] = useState(localStorage.getItem('chatToken') || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('chatUser')) || null);
  
  // Auth Form State
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authError, setAuthError] = useState('');

  // Main App State
  const [friends, setFriends] = useState([]);
  const [pendingIncoming, setPendingIncoming] = useState([]);
  const [pendingOutgoing, setPendingOutgoing] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [activeFriend, setActiveFriend] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [friendTyping, setFriendTyping] = useState(false);

  const [showEmojiPanel, setShowEmojiPanel] = useState(false);
  const [showStickerPanel, setShowStickerPanel] = useState(false);
  const [activeLightboxImg, setActiveLightboxImg] = useState(null);

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const CHAT_SERVER_URL = `http://${window.location.hostname}/chat`;

  // Play "Ting" notification sound using Web Audio API synthesis
  const playNotificationSound = () => {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880.00, ctx.currentTime + 0.1); // A5
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch (err) {
      console.error('Failed to play chat sound:', err);
    }
  };

  // 1. Establish Socket Connection and Listeners
  useEffect(() => {
    if (!token) return;

    const socket = io(`http://${window.location.hostname}/chat`, {
      auth: { token }
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to Chat Socket');
    });

    socket.on('private-message', (msg) => {
      const isFromActiveFriend = activeFriend && msg.sender_id === activeFriend.id;
      const isSentByMe = msg.sender_id === user.id;

      if (isFromActiveFriend || isSentByMe) {
        setMessages((prev) => [...prev, msg]);
        if (isFromActiveFriend) {
          // Send read confirmation to database
          markMessagesAsRead(activeFriend.id);
        }
      } else {
        // Play notification sound for background incoming messages
        playNotificationSound();
      }
      
      // Reload friends list to update badges & previews
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
      playNotificationSound();
    });

    socket.on('friend-request-accepted', () => {
      fetchFriendsList();
      playNotificationSound();
    });

    socket.on('messages-read', ({ readerId }) => {
      if (activeFriend && readerId === activeFriend.id) {
        // Update read receipts locally
        setMessages((prev) =>
          prev.map((m) => (m.receiver_id === readerId ? { ...m, is_read: true } : m))
        );
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [token, activeFriend]);

  // Load Friends List on Mount
  useEffect(() => {
    if (token) {
      fetchFriendsList();
    }
  }, [token]);

  // Scroll chat to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, friendTyping]);

  // Handle active conversation switch
  useEffect(() => {
    if (activeFriend) {
      fetchMessageHistory();
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
      console.error('Error marking as read:', err);
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
      console.error('Error fetching friends:', err);
    }
  };

  // REST API: Load history
  const fetchMessageHistory = async () => {
    if (!activeFriend) return;
    try {
      const res = await fetch(`${CHAT_SERVER_URL}/messages/history/${activeFriend.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!data.error) {
        setMessages(data);
        // Refresh friends list to clear unread badge locally
        fetchFriendsList();
      }
    } catch (err) {
      console.error('Error fetching messages:', err);
    }
  };

  // Auth: Submit registration/login
  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    const endpoint = isRegister ? '/auth/register' : '/auth/login';
    const payload = isRegister 
      ? { username, password, display_name: displayName }
      : { username, password };

    try {
      const res = await fetch(`${CHAT_SERVER_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.error) {
        setAuthError(data.error);
        return;
      }

      localStorage.setItem('chatToken', data.token);
      localStorage.setItem('chatUser', JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      
      setUsername('');
      setPassword('');
      setDisplayName('');
    } catch (err) {
      setAuthError('Không thể kết nối đến Chat Server!');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('chatToken');
    localStorage.removeItem('chatUser');
    setToken('');
    setUser(null);
    setActiveFriend(null);
    setFriends([]);
  };

  // Friendship: Search users
  const handleSearch = async (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    try {
      const res = await fetch(`${CHAT_SERVER_URL}/users/search?query=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!data.error) {
        setSearchResults(data);
      }
    } catch (err) {
      console.error('Search error:', err);
    }
  };

  // Friendship: Send friend invitation
  const sendFriendRequest = async (friendId) => {
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
        alert(data.error);
      } else {
        alert('Đã gửi lời mời kết bạn!');
        setSearchQuery('');
        setSearchResults([]);
        fetchFriendsList();
      }
    } catch (err) {
      console.error('Friend request error:', err);
    }
  };

  // Friendship: Accept invitation
  const acceptFriendRequest = async (friendId) => {
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
      if (!data.error) {
        fetchFriendsList();
      }
    } catch (err) {
      console.error('Accept error:', err);
    }
  };

  // Friendship: Delete friendship
  const deleteFriendship = async (friendId) => {
    if (!window.confirm('Bạn có chắc chắn muốn hủy kết bạn/hủy yêu cầu với người này?')) return;
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
  };

  // Chat: Input typing indicators
  const handleInputChange = (e) => {
    setInputText(e.target.value);
    
    if (!socketRef.current || !activeFriend) return;

    if (!isTyping) {
      setIsTyping(true);
      socketRef.current.emit('typing', { receiverId: activeFriend.id });
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      socketRef.current.emit('stop-typing', { receiverId: activeFriend.id });
    }, 1500);
  };

  // Chat: Send Text Message
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputText.trim() || !activeFriend || !socketRef.current) return;

    socketRef.current.emit('private-message', {
      receiverId: activeFriend.id,
      content: inputText.trim(),
      media_type: 'text'
    });

    const tempMsg = {
      id: Date.now().toString(),
      sender_id: user.id,
      receiver_id: activeFriend.id,
      content: inputText.trim(),
      media_type: 'text',
      created_at: new Date().toISOString()
    };
    setMessages((prev) => [...prev, tempMsg]);

    setInputText('');
    setIsTyping(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    socketRef.current.emit('stop-typing', { receiverId: activeFriend.id });
  };

  // Chat: Send Sticker instantly
  const handleSendSticker = (stickerCode) => {
    if (!activeFriend || !socketRef.current) return;

    socketRef.current.emit('private-message', {
      receiverId: activeFriend.id,
      content: stickerCode,
      media_type: 'sticker'
    });

    const tempMsg = {
      id: Date.now().toString(),
      sender_id: user.id,
      receiver_id: activeFriend.id,
      content: stickerCode,
      media_type: 'sticker',
      created_at: new Date().toISOString()
    };
    setMessages((prev) => [...prev, tempMsg]);
    setShowStickerPanel(false);
  };

  // Chat: Handle File Upload (Images & Videos - Multiple support with local loading states)
  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    for (const file of files) {
      const isVideo = file.type.startsWith('video/') || file.name.endsWith('.mp4');
      const mediaType = isVideo ? 'video' : 'image';
      
      const tempId = Date.now().toString() + Math.random().toString();
      const localPreviewUrl = URL.createObjectURL(file); // Create local blob url for instant preview
      
      const tempMsg = {
        id: tempId,
        sender_id: user.id,
        receiver_id: activeFriend.id,
        content: localPreviewUrl,
        media_type: mediaType,
        created_at: new Date().toISOString(),
        loading: true
      };
      
      setMessages((prev) => [...prev, tempMsg]);

      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch(`${CHAT_SERVER_URL}/upload`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: formData
        });
        const data = await res.json();
        
        if (data.error) {
          alert(`Lỗi: ${data.error}`);
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          continue;
        }

        if (data.fileUrl) {
          socketRef.current.emit('private-message', {
            receiverId: activeFriend.id,
            content: data.fileUrl,
            media_type: mediaType
          });

          // Replace loading message with server URL
          setMessages((prev) =>
            prev.map((m) =>
              m.id === tempId ? { ...m, content: data.fileUrl, loading: false } : m
            )
          );
          
          fetchFriendsList();
        }
      } catch (err) {
        console.error('File upload error:', err);
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        alert('Không thể gửi file!');
      }
    }
  };

  // Formatting function for user active status
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

  // Formatting function for last message preview
  const renderLastMessagePreview = (friend) => {
    const lm = friend.last_message;
    if (!lm) return 'Hãy bắt đầu trò chuyện';

    const isSelf = lm.sender_id === user.id;
    const prefix = isSelf ? 'Bạn: ' : '';
    
    let contentPreview = lm.content;
    if (lm.media_type === 'image') contentPreview = '📷 Đã gửi ảnh';
    else if (lm.media_type === 'video') contentPreview = '🎥 Đã gửi video';
    else if (lm.media_type === 'sticker') contentPreview = `🥟 Sticker ${lm.content}`;

    if (contentPreview.length > 25) {
      contentPreview = contentPreview.substring(0, 25) + '...';
    }

    return `${prefix}${contentPreview}`;
  };

  // Render auth card if not logged in
  if (!token || !user) {
    return (
      <div className="auth-chat-container">
        <div className="auth-chat-card animate-pop">
          <div className="auth-chat-header flex-center gap-8">
            <Sparkles size={28} className="text-primary animate-pulse" />
            <h2>Tín Trung Trung Tình</h2>
          </div>
          
          <p className="auth-chat-subtitle">Chat Online</p>

          <form onSubmit={handleAuth} className="auth-chat-form">
            {isRegister && (
              <div className="input-group">
                <label>Tên hiển thị</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Lợi đẹp trai, Tín độc thân"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                />
              </div>
            )}

            <div className="input-group">
              <label>Tên đăng nhập</label>
              <input
                type="text"
                placeholder="Nhập tên tài khoản"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                required
              />
            </div>

            <div className="input-group">
              <label>Mật khẩu</label>
              <input
                type="password"
                placeholder="Nhập mật khẩu"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {authError && <div className="auth-error-msg">{authError}</div>}

            <button type="submit" className="btn-primary auth-submit-btn">
              {isRegister ? 'Đăng Ký Tài Khoản' : 'Đăng Nhập'}
            </button>
          </form>

          <div className="auth-toggle-link">
            <span>
              {isRegister ? 'Đã có tài khoản?' : 'Chưa có tài khoản mạng xã hội?'}
            </span>
            <button onClick={() => { setIsRegister(!isRegister); setAuthError(''); }}>
              {isRegister ? 'Đăng nhập ngay' : 'Đăng ký ngay'}
            </button>
          </div>
        </div>
        <style>{`
          .auth-chat-container {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 70vh;
          }
          .auth-chat-card {
            background-color: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 32px;
            width: 100%;
            max-width: 420px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);
          }
          .auth-chat-header h2 {
            font-size: 1.6rem;
            font-weight: 800;
            background: linear-gradient(135deg, var(--primary) 0%, #3b82f6 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
          }
          .auth-chat-subtitle {
            text-align: center;
            color: var(--text-muted);
            font-size: 0.9rem;
            margin-bottom: 24px;
            margin-top: 4px;
          }
          .auth-chat-form {
            display: flex;
            flex-direction: column;
            gap: 16px;
          }
          .auth-chat-form .input-group {
            display: flex;
            flex-direction: column;
            gap: 6px;
          }
          .auth-chat-form label {
            font-size: 0.85rem;
            font-weight: 700;
            color: var(--text-muted);
          }
          .auth-chat-form input {
            padding: 12px;
            border: 1px solid var(--border);
            border-radius: 8px;
            background-color: var(--bg-body);
            color: var(--text);
            font-size: 0.95rem;
          }
          .auth-chat-form input:focus {
            outline: none;
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
          }
          .auth-error-msg {
            color: #ef4444;
            font-size: 0.85rem;
            font-weight: 600;
            background-color: #fee2e2;
            padding: 10px;
            border-radius: 6px;
          }
          .auth-submit-btn {
            padding: 14px;
            font-weight: 800;
            border-radius: 8px;
            font-size: 0.95rem;
            margin-top: 8px;
            cursor: pointer;
          }
          .auth-toggle-link {
            text-align: center;
            margin-top: 20px;
            font-size: 0.85rem;
            color: var(--text-muted);
          }
          .auth-toggle-link button {
            background: none;
            border: none;
            color: var(--primary);
            font-weight: 700;
            cursor: pointer;
            margin-left: 6px;
            text-decoration: underline;
          }
        `}</style>
      </div>
    );
  }

  // Render Chat application panel
  return (
    <div className="social-chat-wrapper card animate-pop">
      <div className="social-chat-container">
        
        {/* Left Sidebar */}
        <div className="social-sidebar">
          {/* User Profile Header */}
          <div className="sidebar-profile-header flex-between">
            <div className="profile-info flex-center gap-8">
              <div className="avatar-circle">
                <User size={18} />
              </div>
              <div>
                <h4>{user.display_name}</h4>
                <p>@{user.username}</p>
              </div>
            </div>
            <button className="btn-icon-danger" onClick={handleLogout} title="Đăng xuất">
              <LogOut size={16} />
            </button>
          </div>

          {/* Search friends */}
          <div className="search-friends-box">
            <div className="search-input-wrapper">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                placeholder="Tìm kiếm người dùng..."
                value={searchQuery}
                onChange={handleSearch}
              />
            </div>

            {/* Search results list */}
            {searchResults.length > 0 && (
              <div className="search-results-dropdown card">
                {searchResults.map((usr) => {
                  const isFriend = friends.some(f => f.id === usr.id);
                  const isPendingIn = pendingIncoming.some(f => f.id === usr.id);
                  const isPendingOut = pendingOutgoing.some(f => f.id === usr.id);

                  return (
                    <div key={usr.id} className="search-result-row flex-between">
                      <div className="result-info">
                        <strong>{usr.display_name}</strong>
                        <span className="result-username">@{usr.username}</span>
                      </div>
                      
                      {isFriend ? (
                        <span className="badge-friend text-success">Bạn bè</span>
                      ) : isPendingOut ? (
                        <span className="badge-friend text-warning">Đã gửi</span>
                      ) : isPendingIn ? (
                        <button className="btn-success-mini" onClick={() => acceptFriendRequest(usr.id)}>
                          Chấp nhận
                        </button>
                      ) : (
                        <button className="btn-primary-mini flex-center gap-4" onClick={() => sendFriendRequest(usr.id)}>
                          <UserPlus size={12} />
                          <span>Kết bạn</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Scroller categories */}
          <div className="sidebar-lists-scroller">
            
            {/* Friend Requests invitations */}
            {pendingIncoming.length > 0 && (
              <div className="list-group">
                <span className="list-group-title">Lời mời kết bạn ({pendingIncoming.length})</span>
                {pendingIncoming.map((req) => (
                  <div key={req.id} className="request-list-row flex-between">
                    <span>{req.display_name}</span>
                    <div className="action-buttons">
                      <button className="btn-icon-success" onClick={() => acceptFriendRequest(req.id)} title="Đồng ý">
                        <Check size={16} />
                      </button>
                      <button className="btn-icon-danger" onClick={() => deleteFriendship(req.id)} title="Từ chối">
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Friend Conversational lists */}
            <div className="list-group" style={{ marginTop: 12 }}>
              <span className="list-group-title">Cuộc hội thoại ({friends.length})</span>
              {friends.length === 0 ? (
                <p className="empty-list-text">Chưa kết bạn với ai. Hãy dùng thanh tìm kiếm để kết bạn!</p>
              ) : (
                friends.map((friend) => {
                  const isActive = activeFriend && activeFriend.id === friend.id;
                  const isOnline = friend.status === 'online';
                  const hasUnread = friend.unread_count > 0;

                  return (
                    <div
                      key={friend.id}
                      className={`friend-list-row flex-between ${isActive ? 'active' : ''} ${hasUnread ? 'unread-conversation' : ''}`}
                      onClick={() => setActiveFriend(friend)}
                    >
                      <div className="friend-info flex-center gap-8">
                        <div className="friend-avatar-circle">
                          <span className="letter-bold">
                            {friend.display_name.charAt(0).toUpperCase()}
                          </span>
                          <span className={`status-dot ${isOnline ? 'online' : 'offline'}`}></span>
                        </div>
                        <div className="conversation-texts" style={{ overflow: 'hidden' }}>
                          <strong className="friend-disp-name">{friend.display_name}</strong>
                          <span className="last-message-preview">
                            {renderLastMessagePreview(friend)}
                          </span>
                          <span className="status-subtext">
                            {formatActivityStatus(friend)}
                          </span>
                        </div>
                      </div>
                      
                      <div className="right-indicators flex-center gap-8">
                        {hasUnread && (
                          <span className="unread-badge-circle">{friend.unread_count}</span>
                        )}
                        <button
                          className="btn-delete-friend"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteFriendship(friend.id);
                          }}
                          title="Hủy kết bạn"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

          </div>
        </div>

        {/* Right Chat Pane */}
        <div className="social-chat-pane">
          {activeFriend ? (
            <div className="chat-room-container">
              {/* Chat Header */}
              <div className="chat-room-header flex-between">
                <div className="chat-partner-info flex-center gap-8">
                  <div className="avatar-circle">
                    <span className="letter-bold">{activeFriend.display_name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div>
                    <h3>{activeFriend.display_name}</h3>
                    <p className="partner-status">
                      {formatActivityStatus(activeFriend)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Chat Message Scroll pane */}
              <div className="chat-messages-scroller">
                {messages.length === 0 ? (
                  <div className="empty-chat-placeholder">
                    <MessageSquare size={36} className="text-muted" />
                    <p>Hãy bắt đầu cuộc trò chuyện với {activeFriend.display_name}!</p>
                  </div>
                ) : (() => {
                  const lastSentIndex = (() => {
                    for (let i = messages.length - 1; i >= 0; i--) {
                      if (messages[i].sender_id === user.id) {
                        return i;
                      }
                    }
                    return -1;
                  })();

                  return messages.map((msg, index) => {
                    const isSelf = msg.sender_id === user.id;
                    const date = new Date(msg.created_at);
                    const timeStr = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

                    // Render media content based on message type
                    const renderBubbleContent = () => {
                      if (msg.media_type === 'image') {
                        const imgUrl = msg.content.startsWith('http') || msg.content.startsWith('blob:')
                          ? msg.content 
                          : `http://${window.location.hostname}${msg.content}`;
                        return (
                          <div className="media-loading-container" style={{ cursor: 'pointer' }} onClick={() => setActiveLightboxImg(imgUrl)}>
                            <img
                              src={imgUrl}
                              alt="Gửi ảnh"
                              className="chat-image-content"
                            />
                            {msg.loading && (
                              <div className="media-spinner-overlay">
                                <div className="media-spinner"></div>
                              </div>
                            )}
                          </div>
                        );
                      }
                      if (msg.media_type === 'video') {
                        const vidUrl = msg.content.startsWith('http') || msg.content.startsWith('blob:')
                          ? msg.content 
                          : `http://${window.location.hostname}${msg.content}`;
                        return (
                          <div className="media-loading-container">
                            <video
                              src={vidUrl}
                              controls={!msg.loading}
                              className="chat-video-content"
                            />
                            {msg.loading && (
                              <div className="media-spinner-overlay">
                                <div className="media-spinner"></div>
                              </div>
                            )}
                          </div>
                        );
                      }
                      if (msg.media_type === 'sticker') {
                        return <span className="chat-sticker-content">{msg.content}</span>;
                      }
                      return <p>{msg.content}</p>;
                    };

                    const isSticker = msg.media_type === 'sticker';

                    return (
                      <div key={msg.id} className={`message-bubble-wrapper ${isSelf ? 'self' : 'other'}`}>
                        <div className={`message-bubble-container ${isSelf ? 'self-align' : 'other-align'}`}>
                          <div className={`message-bubble ${isSticker ? 'sticker-bubble' : ''}`}>
                            {renderBubbleContent()}
                            <span className="message-time">{timeStr}</span>
                          </div>
                          {index === lastSentIndex && !msg.loading && (
                            <span className="message-status-text">
                              {msg.is_read ? 'Đã xem' : 'Đã gửi'}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
                {friendTyping && (
                  <div className="message-bubble-wrapper other">
                    <div className="message-bubble typing-indicator-bubble">
                      <span className="typing-dots">
                        <span>.</span><span>.</span><span>.</span>
                      </span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Advanced Message Input Bar (Uploads, Emojis, Stickers) */}
              <div className="chat-input-wrapper-container">
                {/* 1. Emoji Selector Panel */}
                {showEmojiPanel && (
                  <div className="selector-panel emoji-panel flex-center gap-8 animate-pop">
                    {EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className="btn-select-item"
                        onClick={() => {
                          setInputText((prev) => prev + emoji);
                          setShowEmojiPanel(false);
                        }}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}

                {/* 2. Sticker Selector Panel */}
                {showStickerPanel && (
                  <div className="selector-panel sticker-panel flex-center gap-12 animate-pop">
                    {STICKERS.map((stk) => (
                      <button
                        key={stk.code}
                        type="button"
                        className="btn-select-sticker flex-column flex-center"
                        onClick={() => handleSendSticker(stk.code)}
                      >
                        <span className="sticker-face">{stk.code}</span>
                        <span className="sticker-label">{stk.label}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Input row */}
                <form className="chat-input-bar" onSubmit={handleSendMessage}>
                  <div className="media-buttons flex-center gap-8">
                    {/* Emoji toggle */}
                    <button
                      type="button"
                      className={`btn-media-action ${showEmojiPanel ? 'active' : ''}`}
                      onClick={() => {
                        setShowEmojiPanel(!showEmojiPanel);
                        setShowStickerPanel(false);
                      }}
                      title="Emojis"
                    >
                      <Smile size={18} />
                    </button>

                    {/* Sticker toggle */}
                    <button
                      type="button"
                      className={`btn-media-action ${showStickerPanel ? 'active' : ''}`}
                      onClick={() => {
                        setShowStickerPanel(!showStickerPanel);
                        setShowEmojiPanel(false);
                      }}
                      title="Stickers"
                    >
                      <Sparkles size={18} />
                    </button>

                    {/* Image & Video picker (multiple) */}
                    <label className="btn-media-action file-label-btn" title="Gửi ảnh hoặc video">
                      <Image size={18} />
                      <input
                        type="file"
                        accept="image/*,video/*"
                        multiple
                        style={{ display: 'none' }}
                        onChange={handleFileUpload}
                      />
                    </label>
                  </div>

                  <input
                    type="text"
                    placeholder="Nhập tin nhắn..."
                    value={inputText}
                    onChange={handleInputChange}
                  />

                  <button type="submit" className="btn-send-message" disabled={!inputText.trim()}>
                    <Send size={16} />
                  </button>
                </form>
              </div>

            </div>
          ) : (
            <div className="no-chat-selected flex-center">
              <div className="text-center">
                <Sparkles size={48} className="text-primary animate-bounce" style={{ marginBottom: 12, display: 'inline-block' }} />
                <h3>Chọn bạn bè để bắt đầu trò chuyện</h3>
                <p>Tin nhắn và cuộc gọi media thời gian thực.</p>
              </div>
            </div>
          )}
        </div>

      </div>

      {activeLightboxImg && (
        <div className="lightbox-overlay" onClick={() => setActiveLightboxImg(null)}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img src={activeLightboxImg} alt="Phóng to" />
            <button className="btn-close-lightbox" onClick={() => setActiveLightboxImg(null)}>
              <X size={24} />
            </button>
          </div>
        </div>
      )}

      <style>{`
        .social-chat-wrapper {
          border-radius: 16px;
          overflow: hidden;
          background-color: var(--bg-card);
          border: 1px solid var(--border);
          box-shadow: 0 10px 25px -5px rgba(0,0,0,0.02);
        }
        .social-chat-container {
          display: flex;
          height: 620px;
        }
        .social-sidebar {
          width: 320px;
          border-right: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          background-color: var(--bg-card);
        }
        .sidebar-profile-header {
          padding: 16px;
          border-bottom: 1px solid var(--border);
          background-color: var(--bg-body);
        }
        .avatar-circle {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background-color: var(--primary-light);
          color: var(--primary);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .letter-bold {
          font-weight: 800;
          color: #475569;
          font-size: 1rem;
        }
        .profile-info h4 {
          font-size: 0.95rem;
          font-weight: 800;
          color: var(--text);
        }
        .profile-info p {
          font-size: 0.75rem;
          color: var(--text-muted);
          font-weight: 600;
        }
        .search-friends-box {
          padding: 12px;
          border-bottom: 1px solid var(--border);
          position: relative;
        }
        .search-input-wrapper {
          display: flex;
          align-items: center;
          background-color: var(--bg-body);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 4px 10px;
        }
        .search-icon {
          color: var(--text-muted);
          margin-right: 8px;
        }
        .search-input-wrapper input {
          border: none;
          background: transparent;
          font-size: 0.85rem;
          width: 100%;
          color: var(--text);
          padding: 6px 0;
        }
        .search-input-wrapper input:focus {
          outline: none;
        }
        .search-results-dropdown {
          position: absolute;
          top: 56px;
          left: 12px;
          right: 12px;
          z-index: 10;
          background-color: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 8px;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
          max-height: 200px;
          overflow-y: auto;
          padding: 6px;
        }
        .search-result-row {
          padding: 8px 12px;
          border-radius: 6px;
        }
        .search-result-row:hover {
          background-color: var(--bg-body);
        }
        .result-info strong {
          display: block;
          font-size: 0.85rem;
          color: var(--text);
        }
        .result-username {
          font-size: 0.75rem;
          color: var(--text-muted);
        }
        .btn-primary-mini, .btn-success-mini {
          padding: 6px 10px;
          border-radius: 6px;
          border: none;
          font-size: 0.75rem;
          font-weight: 700;
          cursor: pointer;
        }
        .btn-primary-mini {
          background-color: var(--primary);
          color: #ffffff;
        }
        .btn-success-mini {
          background-color: var(--success-light);
          color: var(--success-dark);
        }
        .badge-friend {
          font-size: 0.75rem;
          font-weight: 700;
        }
        .sidebar-lists-scroller {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
        }
        .list-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .list-group-title {
          font-size: 0.75rem;
          font-weight: 800;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 6px;
        }
        .request-list-row {
          padding: 8px 10px;
          border: 1px solid var(--border);
          border-radius: 8px;
          font-size: 0.85rem;
          font-weight: 700;
          background-color: var(--bg-body);
        }
        .action-buttons {
          display: flex;
          gap: 4px;
        }
        .friend-list-row {
          padding: 12px 10px;
          border-radius: 8px;
          cursor: pointer;
          transition: background-color 0.2s;
          display: flex;
          align-items: center;
        }
        .friend-list-row:hover {
          background-color: var(--bg-body);
        }
        .friend-list-row.active {
          background-color: var(--primary-light);
        }
        .friend-list-row.active strong {
          color: var(--primary-dark);
        }
        .friend-avatar-circle {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background-color: #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }
        .status-dot {
          position: absolute;
          bottom: 0;
          right: 0;
          width: 9px;
          height: 9px;
          border-radius: 50%;
          border: 2px solid #ffffff;
        }
        .status-dot.online {
          background-color: #10b981;
          box-shadow: 0 0 8px #10b981;
        }
        .status-dot.offline {
          background-color: #94a3b8;
        }
        .conversation-texts {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .friend-disp-name {
          font-size: 0.85rem;
          color: var(--text);
        }
        .last-message-preview {
          font-size: 0.75rem;
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-weight: 500;
        }
        .status-subtext {
          font-size: 0.65rem;
          color: var(--text-muted);
          font-weight: 600;
        }
        .unread-conversation .friend-disp-name {
          font-weight: 900;
        }
        .unread-conversation .last-message-preview {
          color: var(--primary-dark);
          font-weight: 800;
        }
        .unread-badge-circle {
          background-color: var(--primary);
          color: #ffffff;
          border-radius: 50%;
          width: 18px;
          height: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.65rem;
          font-weight: 800;
        }
        .btn-delete-friend {
          background: transparent;
          border: none;
          color: var(--text-muted);
          opacity: 0;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
        }
        .friend-list-row:hover .btn-delete-friend {
          opacity: 1;
        }
        .btn-delete-friend:hover {
          background-color: #fee2e2;
          color: #ef4444;
        }
        .empty-list-text {
          font-size: 0.8rem;
          color: var(--text-muted);
          text-align: center;
          margin-top: 10px;
          line-height: 16px;
        }
        
        .social-chat-pane {
          flex: 1;
          display: flex;
          flex-direction: column;
          background-color: var(--bg-body);
        }
        .chat-room-container {
          display: flex;
          flex-direction: column;
          height: 100%;
        }
        .chat-room-header {
          padding: 14px 20px;
          background-color: var(--bg-card);
          border-bottom: 1px solid var(--border);
        }
        .chat-partner-info h3 {
          font-size: 0.95rem;
          font-weight: 800;
          color: var(--text);
        }
        .partner-status {
          font-size: 0.75rem;
          color: var(--text-muted);
          margin-top: 2px;
          font-weight: 600;
        }
        .chat-messages-scroller {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .message-bubble-wrapper {
          display: flex;
          width: 100%;
        }
        .message-bubble-wrapper.self {
          justify-content: flex-end;
        }
        .message-bubble-wrapper.other {
          justify-content: flex-start;
        }
        .message-bubble {
          max-width: 65%;
          padding: 10px 14px;
          border-radius: 16px;
          box-shadow: 0 1px 2px rgba(0,0,0,0.02);
        }
        .message-bubble p {
          font-size: 0.9rem;
          line-height: 18px;
          word-break: break-word;
        }
        .message-bubble-wrapper.self .message-bubble {
          background-color: var(--primary);
          color: #ffffff;
          border-bottom-right-radius: 2px;
        }
        .message-bubble-wrapper.other .message-bubble {
          background-color: var(--bg-card);
          border: 1px solid var(--border);
          color: var(--text);
          border-bottom-left-radius: 2px;
        }
        
        /* Media and sticker styling */
        .chat-image-content {
          max-width: 240px;
          max-height: 200px;
          border-radius: 8px;
          margin-top: 4px;
          object-fit: cover;
          display: block;
        }
        .chat-video-content {
          max-width: 280px;
          max-height: 220px;
          border-radius: 8px;
          margin-top: 4px;
          display: block;
        }
        .chat-sticker-content {
          font-size: 3.5rem;
          display: inline-block;
          animation: bounce-sticker 0.5s ease-out;
        }
        @keyframes bounce-sticker {
          0% { transform: scale(0.3); }
          50% { transform: scale(1.1); }
          100% { transform: scale(1.0); }
        }
        .sticker-bubble {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
        }
        
        .message-time {
          display: block;
          font-size: 0.65rem;
          margin-top: 4px;
          text-align: right;
          opacity: 0.7;
          font-weight: 600;
        }
        .typing-indicator-bubble {
          padding: 10px 18px;
        }
        .typing-dots span {
          animation: typing-bounce 1.4s infinite both;
          font-weight: 900;
          font-size: 1.2rem;
          display: inline-block;
          margin: 0 1px;
        }
        .typing-dots span:nth-child(2) {
          animation-delay: .2s;
        }
        .typing-dots span:nth-child(3) {
          animation-delay: .4s;
        }
        @keyframes typing-bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-5px); }
        }
        .empty-chat-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: var(--text-muted);
          gap: 10px;
          font-weight: 600;
          font-size: 0.9rem;
        }
        
        .chat-input-wrapper-container {
          background-color: var(--bg-card);
          border-top: 1px solid var(--border);
          position: relative;
        }
        .chat-input-bar {
          padding: 12px 20px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .chat-input-bar input {
          flex: 1;
          padding: 10px 14px;
          border: 1px solid var(--border);
          border-radius: 99px;
          background-color: var(--bg-body);
          color: var(--text);
          font-size: 0.9rem;
        }
        .chat-input-bar input:focus {
          outline: none;
          border-color: var(--primary);
        }
        .btn-send-message {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background-color: var(--primary);
          color: #ffffff;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .btn-send-message:disabled {
          background-color: var(--border);
          cursor: not-allowed;
        }
        
        /* Selector panels */
        .selector-panel {
          position: absolute;
          bottom: 60px;
          left: 20px;
          background-color: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          padding: 10px;
          z-index: 100;
        }
        .emoji-panel {
          display: flex;
          max-width: 280px;
          flex-wrap: wrap;
        }
        .sticker-panel {
          display: flex;
          max-width: 360px;
          flex-wrap: wrap;
        }
        .btn-select-item {
          background: none;
          border: none;
          font-size: 1.5rem;
          padding: 4px 8px;
          cursor: pointer;
          border-radius: 6px;
          transition: background-color 0.2s;
        }
        .btn-select-item:hover {
          background-color: var(--bg-body);
        }
        .btn-select-sticker {
          background: none;
          border: none;
          cursor: pointer;
          padding: 8px;
          border-radius: 8px;
          transition: background-color 0.2s;
        }
        .btn-select-sticker:hover {
          background-color: var(--bg-body);
        }
        .sticker-face {
          font-size: 2.2rem;
          display: block;
        }
        .sticker-label {
          font-size: 0.65rem;
          color: var(--text-muted);
          font-weight: 700;
          margin-top: 4px;
        }
        .btn-media-action {
          background: none;
          border: none;
          color: var(--text-muted);
          padding: 6px;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        .btn-media-action:hover, .btn-media-action.active {
          background-color: var(--bg-body);
          color: var(--primary);
        }
        .file-label-btn {
          margin-bottom: 0;
        }
        
        .no-chat-selected {
          flex: 1;
          color: var(--text-muted);
        }
        .no-chat-selected h3 {
          font-size: 1.1rem;
          font-weight: 800;
          color: var(--text);
          margin-top: 10px;
          margin-bottom: 6px;
        }
        .no-chat-selected p {
          font-size: 0.85rem;
          font-weight: 600;
        }

        /* Lightbox and loading spinner styles */
        .lightbox-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.95);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 99999;
          animation: fadeIn 0.2s ease-out;
        }
        .lightbox-content {
          position: relative;
          max-width: 90vw;
          max-height: 90vh;
        }
        .lightbox-content img {
          max-width: 90vw;
          max-height: 90vh;
          object-fit: contain;
          border-radius: 8px;
        }
        .btn-close-lightbox {
          position: absolute;
          top: -45px;
          right: 0;
          background: rgba(255, 255, 255, 0.15);
          border: none;
          color: #ffffff;
          cursor: pointer;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background-color 0.2s;
        }
        .btn-close-lightbox:hover {
          background-color: rgba(255, 255, 255, 0.3);
        }
        .message-bubble-container {
          display: flex;
          flex-direction: column;
          max-width: 65%;
        }
        .self-align {
          align-items: flex-end;
        }
        .other-align {
          align-items: flex-start;
        }
        .message-status-text {
          font-size: 0.65rem;
          color: var(--text-muted);
          margin-top: 4px;
          font-weight: 700;
          opacity: 0.85;
        }
        .media-loading-container {
          position: relative;
          display: inline-block;
        }
        .media-spinner-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
        }
        .media-spinner {
          width: 28px;
          height: 28px;
          border: 3px solid rgba(255, 255, 255, 0.3);
          border-radius: 50%;
          border-top-color: #ffffff;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
