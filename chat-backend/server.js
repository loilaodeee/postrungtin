require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3006;
const JWT_SECRET = process.env.JWT_SECRET || 'super_pos_secret_key_123';
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://chat_user:ChatPass123@localhost:5432/postrungtin_chat';

// Setup PostgreSQL pool
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Initialize Firebase Admin for Push Notifications
let firebaseEnabled = false;
const SERVICE_ACCOUNT_PATHS = [
  path.join(__dirname, 'data', 'firebase-service-account.json'),
  path.join(__dirname, '..', 'backend', 'data', 'firebase-service-account.json')
];

let serviceAccountFile = null;
for (const p of SERVICE_ACCOUNT_PATHS) {
  if (fs.existsSync(p)) {
    serviceAccountFile = p;
    break;
  }
}

if (serviceAccountFile) {
  try {
    const serviceAccount = require(serviceAccountFile);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    firebaseEnabled = true;
    console.log(`Firebase Admin initialized successfully using: ${serviceAccountFile}`);
  } catch (error) {
    console.error('Failed to initialize Firebase Admin SDK:', error);
  }
} else {
  console.log('Firebase service account credentials not found. Push notifications will be disabled.');
}

app.use(cors());
app.use(express.json());

// Helper function to send push notifications
async function sendPushNotification(userId, title, body, dataPayload = {}) {
  if (!firebaseEnabled) return;
  try {
    // Get all active FCM tokens for this user from database
    const res = await pool.query('SELECT token FROM user_fcm_tokens WHERE user_id = $1', [userId]);
    const tokens = res.rows.map(row => row.token);
    
    if (tokens.length === 0) {
      console.log(`No registered FCM tokens found for user ID: ${userId}`);
      return;
    }

    console.log(`Sending push notification to user ID: ${userId} (${tokens.length} token(s))`);
    const message = {
      notification: { title, body },
      data: dataPayload
    };

    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: message.notification,
      data: message.data
    });
    
    console.log(`Push notifications sent successfully: ${response.successCount} succeeded, ${response.failureCount} failed.`);
  } catch (error) {
    console.error('Error sending push notification:', error);
  }
}

// ----------------------------------------------------
// REST ENDPOINTS
// ----------------------------------------------------

// 1. Auth: Register
app.post('/auth/register', async (req, res) => {
  const { username, password, display_name } = req.body;
  if (!username || !password || !display_name) {
    return res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin!' });
  }

  try {
    // Check user existence
    const userCheck = await pool.query('SELECT id FROM users WHERE username = $1', [username.trim().toLowerCase()]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Tên tài khoản này đã tồn tại!' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create user
    const newUser = await pool.query(
      'INSERT INTO users (username, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id, username, display_name, avatar_url',
      [username.trim().toLowerCase(), passwordHash, display_name.trim()]
    );

    const user = newUser.rows[0];
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '30d' });

    res.status(201).json({ user, token });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Lỗi máy chủ khi đăng ký.' });
  }
});

// 2. Auth: Login
app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Vui lòng nhập tên tài khoản và mật khẩu!' });
  }

  try {
    const resUser = await pool.query('SELECT * FROM users WHERE username = $1', [username.trim().toLowerCase()]);
    if (resUser.rows.length === 0) {
      return res.status(400).json({ error: 'Tài khoản hoặc mật khẩu không chính xác!' });
    }

    const user = resUser.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Tài khoản hoặc mật khẩu không chính xác!' });
    }

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        avatar_url: user.avatar_url
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Lỗi máy chủ khi đăng nhập.' });
  }
});

// Middleware for JWT Authentication
const authenticate = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Chưa xác thực đăng nhập!' });

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Phiên đăng nhập hết hạn hoặc không hợp lệ!' });
    req.userId = decoded.id;
    next();
  });
};

// 3. User: Profile search
app.get('/users/search', authenticate, async (req, res) => {
  const query = req.query.query ? req.query.query.trim().toLowerCase() : '';
  if (!query) return res.json([]);

  try {
    const dbRes = await pool.query(
      'SELECT id, username, display_name, avatar_url FROM users WHERE (username LIKE $1 OR LOWER(display_name) LIKE $1) AND id != $2 LIMIT 15',
      [`%${query}%`, req.userId]
    );
    res.json(dbRes.rows);
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Lỗi tìm kiếm người dùng.' });
  }
});

// 4. Friendships: List friends & requests
app.get('/friends/list', authenticate, async (req, res) => {
  try {
    // Retrieve all friendships involving the current user
    const dbRes = await pool.query(
      `SELECT f.*, 
              u.id as user_id, u.username, u.display_name, u.avatar_url
       FROM friendships f
       JOIN users u ON (u.id = CASE WHEN f.user_id_1 = $1 THEN f.user_id_2 ELSE f.user_id_1 END)
       WHERE f.user_id_1 = $1 OR f.user_id_2 = $1`,
      [req.userId]
    );

    const friends = [];
    const pendingIncoming = [];
    const pendingOutgoing = [];

    dbRes.rows.forEach(row => {
      const friendData = {
        id: row.user_id,
        username: row.username,
        display_name: row.display_name,
        avatar_url: row.avatar_url
      };

      if (row.status === 'accepted') {
        friends.push(friendData);
      } else if (row.status === 'pending') {
        if (row.action_user_id === req.userId) {
          pendingOutgoing.push(friendData);
        } else {
          pendingIncoming.push(friendData);
        }
      }
    });

    res.json({ friends, pendingIncoming, pendingOutgoing });
  } catch (error) {
    console.error('List friends error:', error);
    res.status(500).json({ error: 'Lỗi tải danh sách bạn bè.' });
  }
});

// 5. Friendships: Send Friend Request
app.post('/friends/request', authenticate, async (req, res) => {
  const { friendId } = req.body;
  if (!friendId || friendId === req.userId) {
    return res.status(400).json({ error: 'Đối tác kết bạn không hợp lệ!' });
  }

  // Ensure canonical order
  const user_id_1 = Math.min(req.userId, friendId);
  const user_id_2 = Math.max(req.userId, friendId);

  try {
    // Check existing relationship
    const check = await pool.query(
      'SELECT * FROM friendships WHERE user_id_1 = $1 AND user_id_2 = $2',
      [user_id_1, user_id_2]
    );

    if (check.rows.length > 0) {
      const rel = check.rows[0];
      if (rel.status === 'accepted') {
        return res.status(400).json({ error: 'Hai người đã là bạn bè từ trước!' });
      } else {
        return res.status(400).json({ error: 'Yêu cầu kết bạn đã được gửi từ trước và đang chờ duyệt!' });
      }
    }

    // Insert pending friendship
    await pool.query(
      'INSERT INTO friendships (user_id_1, user_id_2, status, action_user_id) VALUES ($1, $2, $3, $4)',
      [user_id_1, user_id_2, 'pending', req.userId]
    );

    // Get sender display name to customize push notification
    const senderRes = await pool.query('SELECT display_name FROM users WHERE id = $1', [req.userId]);
    const senderName = senderRes.rows[0]?.display_name || 'Người dùng POS';

    // Send push notification to target user
    sendPushNotification(friendId, '🤝 Lời mời kết bạn mới', `${senderName} muốn kết bạn với bạn!`, {
      type: 'friend_request',
      senderId: req.userId.toString()
    });

    // Notify user via Socket if online
    const receiverSocketIds = activeUsers.get(friendId);
    if (receiverSocketIds) {
      receiverSocketIds.forEach(sockId => {
        io.to(sockId).emit('friend-request-received', {
          sender: {
            id: req.userId,
            display_name: senderName
          }
        });
      });
    }

    res.json({ success: true, message: 'Gửi lời mời kết bạn thành công!' });
  } catch (error) {
    console.error('Friend request error:', error);
    res.status(500).json({ error: 'Lỗi máy chủ gửi kết bạn.' });
  }
});

// 6. Friendships: Accept Friend Request
app.post('/friends/accept', authenticate, async (req, res) => {
  const { friendId } = req.body;
  if (!friendId) return res.status(400).json({ error: 'Yêu cầu không hợp lệ!' });

  const user_id_1 = Math.min(req.userId, friendId);
  const user_id_2 = Math.max(req.userId, friendId);

  try {
    const check = await pool.query(
      'SELECT * FROM friendships WHERE user_id_1 = $1 AND user_id_2 = $2',
      [user_id_1, user_id_2]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy lời mời kết bạn này!' });
    }

    const rel = check.rows[0];
    if (rel.status === 'accepted') {
      return res.json({ success: true, message: 'Đã chấp nhận kết bạn!' });
    }

    if (rel.action_user_id === req.userId) {
      return res.status(400).json({ error: 'Bạn không thể tự chấp nhận lời mời do chính bạn gửi!' });
    }

    // Update status to accepted
    await pool.query(
      "UPDATE friendships SET status = 'accepted' WHERE user_id_1 = $1 AND user_id_2 = $2",
      [user_id_1, user_id_2]
    );

    // Get current user display name
    const accepterRes = await pool.query('SELECT display_name FROM users WHERE id = $1', [req.userId]);
    const accepterName = accepterRes.rows[0]?.display_name || 'Người dùng POS';

    // Send push notification to target user
    sendPushNotification(friendId, '🎉 Đã chấp nhận kết bạn', `${accepterName} đã đồng ý lời mời kết bạn của bạn!`, {
      type: 'friend_accept',
      accepterId: req.userId.toString()
    });

    // Notify target via socket if online
    const receiverSocketIds = activeUsers.get(friendId);
    if (receiverSocketIds) {
      receiverSocketIds.forEach(sockId => {
        io.to(sockId).emit('friend-request-accepted', {
          id: req.userId,
          display_name: accepterName
        });
      });
    }

    res.json({ success: true, message: 'Chấp nhận kết bạn thành công!' });
  } catch (error) {
    console.error('Accept friend error:', error);
    res.status(500).json({ error: 'Lỗi máy chủ chấp nhận kết bạn.' });
  }
});

// 7. Friendships: Delete Friend / Cancel request
app.post('/friends/delete', authenticate, async (req, res) => {
  const { friendId } = req.body;
  if (!friendId) return res.status(400).json({ error: 'Yêu cầu không hợp lệ!' });

  const user_id_1 = Math.min(req.userId, friendId);
  const user_id_2 = Math.max(req.userId, friendId);

  try {
    await pool.query(
      'DELETE FROM friendships WHERE user_id_1 = $1 AND user_id_2 = $2',
      [user_id_1, user_id_2]
    );
    res.json({ success: true, message: 'Hủy kết bạn thành công!' });
  } catch (error) {
    console.error('Delete friend error:', error);
    res.status(500).json({ error: 'Lỗi hủy kết bạn.' });
  }
});

// 8. Messages: Get History (Paginated)
app.get('/messages/history/:friendId', authenticate, async (req, res) => {
  const { friendId } = req.params;
  const limit = 50;
  const offset = req.query.offset ? Number(req.query.offset) : 0;

  try {
    const dbRes = await pool.query(
      `SELECT * FROM messages 
       WHERE (sender_id = $1 AND receiver_id = $2) 
          OR (sender_id = $2 AND receiver_id = $1)
       ORDER BY created_at DESC 
       LIMIT $3 OFFSET $4`,
      [req.userId, friendId, limit, offset]
    );

    // Messages are returned newest-first, we reverse to display chronologically
    const messages = dbRes.rows.reverse();
    res.json(messages);
  } catch (error) {
    console.error('Get message history error:', error);
    res.status(500).json({ error: 'Lỗi tải lịch sử tin nhắn.' });
  }
});

// ----------------------------------------------------
// SOCKET.IO REALTIME EVENTS
// ----------------------------------------------------

// User connection registry: Map<userId, Set<socketId>>
const activeUsers = new Map();

// Middleware to authenticate socket connections
io.use((socket, next) => {
  const token = socket.handshake.auth.token || socket.handshake.query.token;
  if (!token) {
    return next(new Error('Chưa cung cấp mã token xác thực!'));
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return next(new Error('Mã token không hợp lệ!'));
    socket.userId = decoded.id;
    next();
  });
});

io.on('connection', (socket) => {
  const uId = socket.userId;
  console.log(`Socket client connected to CHAT: ${socket.id} (User ID: ${uId})`);
  
  // Register socket ID under user ID
  if (!activeUsers.has(uId)) {
    activeUsers.set(uId, new Set());
  }
  activeUsers.get(uId).add(socket.id);

  // Broadcast user online status
  io.emit('user-status-change', { userId: uId, status: 'online' });

  // 1. Listen for FCM Token Registration from App
  socket.on('register-fcm-token', async (token) => {
    if (!token) return;
    try {
      await pool.query(
        'INSERT INTO user_fcm_tokens (user_id, token) VALUES ($1, $2) ON CONFLICT (user_id, token) DO NOTHING',
        [uId, token]
      );
      console.log(`Registered FCM token for user ID ${uId}`);
    } catch (error) {
      console.error('Error saving user FCM token:', error);
    }
  });

  // 2. Listen for typing state
  socket.on('typing', ({ receiverId }) => {
    const receiverSockets = activeUsers.get(receiverId);
    if (receiverSockets) {
      receiverSockets.forEach(sockId => {
        io.to(sockId).emit('typing', { senderId: uId });
      });
    }
  });

  socket.on('stop-typing', ({ receiverId }) => {
    const receiverSockets = activeUsers.get(receiverId);
    if (receiverSockets) {
      receiverSockets.forEach(sockId => {
        io.to(sockId).emit('stop-typing', { senderId: uId });
      });
    }
  });

  // 3. Listen for incoming private message
  socket.on('private-message', async ({ receiverId, content }) => {
    const text = content ? content.trim() : '';
    if (!text || !receiverId) return;

    try {
      // Save message in PostgreSQL database
      const dbRes = await pool.query(
        'INSERT INTO messages (sender_id, receiver_id, content) VALUES ($1, $2, $3) RETURNING *',
        [uId, receiverId, text]
      );
      const savedMsg = dbRes.rows[0];

      // Get sender details to label push notifications
      const senderRes = await pool.query('SELECT display_name FROM users WHERE id = $1', [uId]);
      const senderName = senderRes.rows[0]?.display_name || 'Bạn bè';

      // Send to receiver if online
      const receiverSockets = activeUsers.get(receiverId);
      let receiverNotified = false;

      if (receiverSockets && receiverSockets.size > 0) {
        receiverSockets.forEach(sockId => {
          io.to(sockId).emit('private-message', savedMsg);
        });
        receiverNotified = true;
      }

      // Echo message back to sender (to sync multiple windows/devices for the sender)
      const senderSockets = activeUsers.get(uId);
      if (senderSockets) {
        senderSockets.forEach(sockId => {
          // Avoid echoing to the sending socket if they handle local echo
          if (sockId !== socket.id) {
            io.to(sockId).emit('private-message', savedMsg);
          }
        });
      }

      // If receiver has no open sockets (offline), send FCM Push Notification!
      if (!receiverNotified) {
        sendPushNotification(receiverId, senderName, text, {
          type: 'chat_message',
          senderId: uId.toString()
        });
      }

    } catch (error) {
      console.error('Error handling private message:', error);
      socket.emit('error', 'Không thể gửi tin nhắn.');
    }
  });

  // Disconnection handler
  socket.on('disconnect', () => {
    console.log(`Socket client disconnected from CHAT: ${socket.id}`);
    const userSockets = activeUsers.get(uId);
    if (userSockets) {
      userSockets.delete(socket.id);
      if (userSockets.size === 0) {
        activeUsers.delete(uId);
        // Broadcast user offline status
        io.emit('user-status-change', { userId: uId, status: 'offline' });
      }
    }
  });
});

// Start Server
server.listen(PORT, () => {
  console.log(`=== Chat & Social Server running on port ${PORT} ===`);
});
