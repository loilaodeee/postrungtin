const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const JWT_SECRET = 'super_pos_secret_key_123';
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://chat_user:ChatPass123@localhost:5432/postrungtin_chat';

// Setup PostgreSQL pool
const pool = new Pool({
  connectionString: DATABASE_URL
});

// Check/Initialize Firebase Admin
let firebaseEnabled = false;
try {
  admin.app(); // Throws if the default app is not initialized
  firebaseEnabled = true;
  console.log('Chat module: Firebase Admin already initialized by parent process.');
} catch (e) {
  // Not initialized, try to initialize it
  const SERVICE_ACCOUNT_FILE = path.join(__dirname, 'data', 'firebase-service-account.json');
  if (fs.existsSync(SERVICE_ACCOUNT_FILE)) {
    try {
      const serviceAccount = require(SERVICE_ACCOUNT_FILE);
      admin.initializeApp({
        credential: admin.cert ? admin.cert(serviceAccount) : admin.credential.cert(serviceAccount)
      });
      firebaseEnabled = true;
      console.log('Chat module: Firebase Admin initialized successfully.');
    } catch (err) {
      console.error('Chat module: Failed to initialize Firebase Admin SDK:', err);
    }
  }
}

// User connection registry: Map<userId, Set<socketId>>
const activeUsers = new Map();

async function sendPushNotification(userId, title, body, dataPayload = {}) {
  if (!firebaseEnabled) return;
  try {
    const res = await pool.query('SELECT token FROM user_fcm_tokens WHERE user_id = $1', [userId]);
    const tokens = res.rows.map(row => row.token);
    
    if (tokens.length === 0) return;

    const message = {
      notification: { title, body },
      data: dataPayload
    };

    await admin.messaging().sendEachForMulticast({
      tokens,
      notification: message.notification,
      data: message.data
    });
    console.log(`Chat push notification sent to user ID: ${userId}`);
  } catch (error) {
    console.error('Error sending chat push notification:', error);
  }
}

module.exports = function setupChat(app, io) {
  // ----------------------------------------------------
  // REST API Routes (Mounted under /chat)
  // ----------------------------------------------------

  // Register
  app.post('/chat/auth/register', async (req, res) => {
    const { username, password, display_name } = req.body;
    if (!username || !password || !display_name) {
      return res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin!' });
    }

    try {
      const userCheck = await pool.query('SELECT id FROM users WHERE username = $1', [username.trim().toLowerCase()]);
      if (userCheck.rows.length > 0) {
        return res.status(400).json({ error: 'Tên tài khoản này đã tồn tại!' });
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

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

  // Login
  app.post('/chat/auth/login', async (req, res) => {
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

  // Auth Middleware
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

  // Search profiles
  app.get('/chat/users/search', authenticate, async (req, res) => {
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

  // Friends & Requests list
  app.get('/chat/friends/list', authenticate, async (req, res) => {
    try {
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

  // Send request
  app.post('/chat/friends/request', authenticate, async (req, res) => {
    const { friendId } = req.body;
    if (!friendId || friendId === req.userId) {
      return res.status(400).json({ error: 'Đối tác kết bạn không hợp lệ!' });
    }

    const user_id_1 = Math.min(req.userId, friendId);
    const user_id_2 = Math.max(req.userId, friendId);

    try {
      const check = await pool.query(
        'SELECT * FROM friendships WHERE user_id_1 = $1 AND user_id_2 = $2',
        [user_id_1, user_id_2]
      );

      if (check.rows.length > 0) {
        const rel = check.rows[0];
        if (rel.status === 'accepted') {
          return res.status(400).json({ error: 'Hai người đã là bạn bè từ trước!' });
        } else {
          return res.status(400).json({ error: 'Yêu cầu kết bạn đã được gửi từ trước!' });
        }
      }

      await pool.query(
        'INSERT INTO friendships (user_id_1, user_id_2, status, action_user_id) VALUES ($1, $2, $3, $4)',
        [user_id_1, user_id_2, 'pending', req.userId]
      );

      const senderRes = await pool.query('SELECT display_name FROM users WHERE id = $1', [req.userId]);
      const senderName = senderRes.rows[0]?.display_name || 'Người dùng POS';

      sendPushNotification(friendId, '🤝 Lời mời kết bạn mới', `${senderName} muốn kết bạn với bạn!`, {
        type: 'friend_request',
        senderId: req.userId.toString()
      });

      const receiverSockets = activeUsers.get(friendId);
      if (receiverSockets) {
        receiverSockets.forEach(sockId => {
          chatIo.to(sockId).emit('friend-request-received', {
            sender: { id: req.userId, display_name: senderName }
          });
        });
      }

      res.json({ success: true, message: 'Gửi lời mời kết bạn thành công!' });
    } catch (error) {
      console.error('Friend request error:', error);
      res.status(500).json({ error: 'Lỗi máy chủ gửi kết bạn.' });
    }
  });

  // Accept request
  app.post('/chat/friends/accept', authenticate, async (req, res) => {
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
        return res.status(404).json({ error: 'Không tìm thấy lời mời kết bạn!' });
      }

      const rel = check.rows[0];
      if (rel.status === 'accepted') {
        return res.json({ success: true });
      }

      if (rel.action_user_id === req.userId) {
        return res.status(400).json({ error: 'Bạn không thể tự đồng ý lời mời của mình!' });
      }

      await pool.query(
        "UPDATE friendships SET status = 'accepted' WHERE user_id_1 = $1 AND user_id_2 = $2",
        [user_id_1, user_id_2]
      );

      const accepterRes = await pool.query('SELECT display_name FROM users WHERE id = $1', [req.userId]);
      const accepterName = accepterRes.rows[0]?.display_name || 'Người dùng POS';

      sendPushNotification(friendId, '🎉 Đã chấp nhận kết bạn', `${accepterName} đã đồng ý lời mời kết bạn của bạn!`, {
        type: 'friend_accept',
        accepterId: req.userId.toString()
      });

      const receiverSockets = activeUsers.get(friendId);
      if (receiverSockets) {
        receiverSockets.forEach(sockId => {
          chatIo.to(sockId).emit('friend-request-accepted', {
            id: req.userId,
            display_name: accepterName
          });
        });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Accept friend error:', error);
      res.status(500).json({ error: 'Lỗi máy chủ chấp nhận kết bạn.' });
    }
  });

  // Delete relationship
  app.post('/chat/friends/delete', authenticate, async (req, res) => {
    const { friendId } = req.body;
    if (!friendId) return res.status(400).json({ error: 'Yêu cầu không hợp lệ!' });

    const user_id_1 = Math.min(req.userId, friendId);
    const user_id_2 = Math.max(req.userId, friendId);

    try {
      await pool.query(
        'DELETE FROM friendships WHERE user_id_1 = $1 AND user_id_2 = $2',
        [user_id_1, user_id_2]
      );
      res.json({ success: true });
    } catch (error) {
      console.error('Delete friend error:', error);
      res.status(500).json({ error: 'Lỗi hủy kết bạn.' });
    }
  });

  // Chat History
  app.get('/chat/messages/history/:friendId', authenticate, async (req, res) => {
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

      res.json(dbRes.rows.reverse());
    } catch (error) {
      console.error('Get message history error:', error);
      res.status(500).json({ error: 'Lỗi tải lịch sử tin nhắn.' });
    }
  });

  // ----------------------------------------------------
  // SOCKET.IO NAMESPACE (/chat)
  // ----------------------------------------------------
  const chatIo = io.of('/chat');

  chatIo.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    if (!token) return next(new Error('Chưa cung cấp mã token xác thực!'));

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) return next(new Error('Mã token không hợp lệ!'));
      socket.userId = decoded.id;
      next();
    });
  });

  chatIo.on('connection', (socket) => {
    const uId = socket.userId;
    console.log(`Socket client connected to NAMESPACE CHAT: ${socket.id} (User: ${uId})`);

    if (!activeUsers.has(uId)) {
      activeUsers.set(uId, new Set());
    }
    activeUsers.get(uId).add(socket.id);

    chatIo.emit('user-status-change', { userId: uId, status: 'online' });

    socket.on('register-fcm-token', async (token) => {
      if (!token) return;
      try {
        await pool.query(
          'INSERT INTO user_fcm_tokens (user_id, token) VALUES ($1, $2) ON CONFLICT (user_id, token) DO NOTHING',
          [uId, token]
        );
      } catch (error) {
        console.error('Error saving user FCM token:', error);
      }
    });

    socket.on('typing', ({ receiverId }) => {
      const receiverSockets = activeUsers.get(receiverId);
      if (receiverSockets) {
        receiverSockets.forEach(sockId => {
          chatIo.to(sockId).emit('typing', { senderId: uId });
        });
      }
    });

    socket.on('stop-typing', ({ receiverId }) => {
      const receiverSockets = activeUsers.get(receiverId);
      if (receiverSockets) {
        receiverSockets.forEach(sockId => {
          chatIo.to(sockId).emit('stop-typing', { senderId: uId });
        });
      }
    });

    socket.on('private-message', async ({ receiverId, content }) => {
      const text = content ? content.trim() : '';
      if (!text || !receiverId) return;

      try {
        const dbRes = await pool.query(
          'INSERT INTO messages (sender_id, receiver_id, content) VALUES ($1, $2, $3) RETURNING *',
          [uId, receiverId, text]
        );
        const savedMsg = dbRes.rows[0];

        const senderRes = await pool.query('SELECT display_name FROM users WHERE id = $1', [uId]);
        const senderName = senderRes.rows[0]?.display_name || 'Bạn bè';

        const receiverSockets = activeUsers.get(receiverId);
        let receiverNotified = false;

        if (receiverSockets && receiverSockets.size > 0) {
          receiverSockets.forEach(sockId => {
            chatIo.to(sockId).emit('private-message', savedMsg);
          });
          receiverNotified = true;
        }

        const senderSockets = activeUsers.get(uId);
        if (senderSockets) {
          senderSockets.forEach(sockId => {
            if (sockId !== socket.id) {
              chatIo.to(sockId).emit('private-message', savedMsg);
            }
          });
        }

        if (!receiverNotified) {
          sendPushNotification(receiverId, senderName, text, {
            type: 'chat_message',
            senderId: uId.toString()
          });
        }
      } catch (error) {
        console.error('Error handling private message:', error);
      }
    });

    socket.on('disconnect', () => {
      const userSockets = activeUsers.get(uId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          activeUsers.delete(uId);
          chatIo.emit('user-status-change', { userId: uId, status: 'offline' });
        }
      }
    });
  });
};
