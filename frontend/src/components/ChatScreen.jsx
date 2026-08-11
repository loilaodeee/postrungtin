import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Send, UserPlus, Search, UserCheck, LogOut, MessageSquare, ShieldAlert, Sparkles, User, Check, X } from 'lucide-react';

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

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const CHAT_SERVER_URL = `http://${window.location.hostname}:3006`;

  // 1. Establish Socket Connection and Listeners
  useEffect(() => {
    if (!token) return;

    // Connect to Chat Server Socket
    const socket = io(CHAT_SERVER_URL, {
      auth: { token }
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to Chat Socket');
    });

    socket.on('private-message', (msg) => {
      // Append message if it's from the active friend or sent by us
      if (
        (activeFriend && msg.sender_id === activeFriend.id) ||
        msg.sender_id === user.id
      ) {
        setMessages((prev) => [...prev, msg]);
      }
      
      // Refresh friends list status/sorting if necessary
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

    return () => {
      socket.disconnect();
    };
  }, [token, activeFriend]);

  // Load Friends List on Mount / Auth
  useEffect(() => {
    if (token) {
      fetchFriendsList();
    }
  }, [token]);

  // Scroll to bottom when message arrives
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, friendTyping]);

  // Load Message History when active friend changes
  useEffect(() => {
    if (activeFriend) {
      fetchMessageHistory();
      setFriendTyping(false);
    } else {
      setMessages([]);
    }
  }, [activeFriend]);

  // REST API: Fetch friends & requests
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

  // REST API: Fetch message history
  const fetchMessageHistory = async () => {
    if (!activeFriend) return;
    try {
      const res = await fetch(`${CHAT_SERVER_URL}/messages/history/${activeFriend.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!data.error) {
        setMessages(data);
      }
    } catch (err) {
      console.error('Error fetching messages:', err);
    }
  };

  // Auth: Handle Register/Login
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
      
      // Clear forms
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

  // Friendship: Send Request
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

  // Friendship: Accept Request
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

  // Friendship: Reject / Cancel Friendship
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

  // Chat: Input typing listeners
  const handleInputChange = (e) => {
    setInputText(e.target.value);
    
    if (!socketRef.current || !activeFriend) return;

    if (!isTyping) {
      setIsTyping(true);
      socketRef.current.emit('typing', { receiverId: activeFriend.id });
    }

    // Clear previous timeout and set new one to emit stop-typing
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      socketRef.current.emit('stop-typing', { receiverId: activeFriend.id });
    }, 1500);
  };

  // Chat: Send Message
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputText.trim() || !activeFriend || !socketRef.current) return;

    // Send private message via socket (it will save in db and emit)
    socketRef.current.emit('private-message', {
      receiverId: activeFriend.id,
      content: inputText.trim()
    });

    // Clear locally
    setInputText('');
    setIsTyping(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    socketRef.current.emit('stop-typing', { receiverId: activeFriend.id });

    // Local echo for instantaneous UX (we also get confirmation back, but we push immediately)
    const tempMsg = {
      id: Date.now().toString(),
      sender_id: user.id,
      receiver_id: activeFriend.id,
      content: inputText.trim(),
      created_at: new Date().toISOString()
    };
    setMessages((prev) => [...prev, tempMsg]);
  };

  // ----------------------------------------------------
  // RENDER LOGIN / REGISTER SCREEN
  // ----------------------------------------------------
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

  // ----------------------------------------------------
  // RENDER SOCIAL NETWORK & CHAT VIEW
  // ----------------------------------------------------
  return (
    <div className="social-chat-wrapper card animate-pop">
      <div className="social-chat-container">
        
        {/* Left Sidebar: User profile, search & friends list */}
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

          {/* Search bar to find new friends */}
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

            {/* User Search Results Dropdown */}
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

          {/* List categories: Pending Requests and Friends list */}
          <div className="sidebar-lists-scroller">
            
            {/* 1. Pending Incoming Requests */}
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

            {/* 2. Friends List */}
            <div className="list-group" style={{ marginTop: 12 }}>
              <span className="list-group-title">Danh sách bạn bè ({friends.length})</span>
              {friends.length === 0 ? (
                <p className="empty-list-text">Chưa kết bạn với ai. Hãy dùng thanh tìm kiếm để kết bạn!</p>
              ) : (
                friends.map((friend) => {
                  const isActive = activeFriend && activeFriend.id === friend.id;
                  const isOnline = friend.status === 'online';

                  return (
                    <div
                      key={friend.id}
                      className={`friend-list-row flex-between ${isActive ? 'active' : ''}`}
                      onClick={() => setActiveFriend(friend)}
                    >
                      <div className="friend-info flex-center gap-8">
                        <div className="friend-avatar-circle">
                          <User size={16} />
                          <span className={`status-dot ${isOnline ? 'online' : 'offline'}`}></span>
                        </div>
                        <div>
                          <strong>{friend.display_name}</strong>
                          <span className="friend-username">@{friend.username}</span>
                        </div>
                      </div>
                      
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
                  );
                })
              )}
            </div>

          </div>
        </div>

        {/* Right Pane: Active Chat Room */}
        <div className="social-chat-pane">
          {activeFriend ? (
            <div className="chat-room-container">
              {/* Chat Room Header */}
              <div className="chat-room-header flex-between">
                <div className="chat-partner-info flex-center gap-8">
                  <div className="avatar-circle">
                    <User size={18} />
                  </div>
                  <div>
                    <h3>{activeFriend.display_name}</h3>
                    <p className="partner-status">
                      {activeFriend.status === 'online' ? '🟢 Đang hoạt động' : '⚫ Ngoại tuyến'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Chat Message list scroller */}
              <div className="chat-messages-scroller">
                {messages.length === 0 ? (
                  <div className="empty-chat-placeholder">
                    <MessageSquare size={36} className="text-muted" />
                    <p>Hãy bắt đầu cuộc trò chuyện với {activeFriend.display_name}!</p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isSelf = msg.sender_id === user.id;
                    const date = new Date(msg.created_at);
                    const timeStr = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

                    return (
                      <div key={msg.id} className={`message-bubble-wrapper ${isSelf ? 'self' : 'other'}`}>
                        <div className="message-bubble">
                          <p>{msg.content}</p>
                          <span className="message-time">{timeStr}</span>
                        </div>
                      </div>
                    );
                  })
                )}
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

              {/* Message Input box */}
              <form className="chat-input-bar" onSubmit={handleSendMessage}>
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
          ) : (
            <div className="no-chat-selected flex-center">
              <div className="text-center">
                <Sparkles size={48} className="text-primary animate-bounce" style={{ marginBottom: 12, display: 'inline-block' }} />
                <h3>Chọn bạn bè để bắt đầu trò chuyện</h3>
                <p>Tin nhắn được đồng bộ thời gian thực bảo mật.</p>
              </div>
            </div>
          )}
        </div>

      </div>

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
          height: 600px;
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
          padding: 10px;
          border-radius: 8px;
          cursor: pointer;
          transition: background-color 0.2s;
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
          width: 32px;
          height: 32px;
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
          width: 8px;
          height: 8px;
          border-radius: 50%;
          border: 1.5px solid #ffffff;
        }
        .status-dot.online {
          background-color: #10b981;
        }
        .status-dot.offline {
          background-color: #94a3b8;
        }
        .friend-info strong {
          display: block;
          font-size: 0.85rem;
          color: var(--text);
        }
        .friend-username {
          font-size: 0.7rem;
          color: var(--text-muted);
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
        .chat-input-bar {
          padding: 12px 20px;
          background-color: var(--bg-card);
          border-top: 1px solid var(--border);
          display: flex;
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
      `}</style>
    </div>
  );
}
