const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 80;
const STATE_FILE = path.join(__dirname, 'data', 'state.json');
const FCM_TOKENS_FILE = path.join(__dirname, 'data', 'fcm_tokens.json');
const SERVICE_ACCOUNT_FILE = path.join(__dirname, 'data', 'firebase-service-account.json');

// Database storage configurations (PostgreSQL) for Cloud deployments
const { Pool } = require('pg');
let pool = null;
if (process.env.DATABASE_URL) {
  console.log('DATABASE_URL detected. Initializing database storage...');
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });
}

async function initDatabase() {
  if (!pool) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS system_state (
        key VARCHAR(50) PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS fcm_tokens (
        token TEXT PRIMARY KEY
      );
    `);
    console.log('Database tables verified/created successfully.');
  } catch (error) {
    console.error('Failed to initialize database tables:', error);
  }
}

// Ensure data directory exists
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}

// Initialize Firebase Admin for background push notifications
const admin = require('firebase-admin');
const { getMessaging } = require('firebase-admin/messaging');
let firebaseApp = null;
let pushEnabled = false;

if (fs.existsSync(SERVICE_ACCOUNT_FILE)) {
  try {
    const serviceAccount = require(SERVICE_ACCOUNT_FILE);
    firebaseApp = admin.initializeApp({
      credential: admin.cert(serviceAccount)
    });
    pushEnabled = true;
    console.log('Firebase Admin initialized successfully. Push notifications are enabled.');
  } catch (error) {
    console.error('Error initializing Firebase Admin with service account key:', error);
  }
} else {
  console.log('Firebase service account key not found at backend/data/firebase-service-account.json. Background push notifications will be disabled.');
}

// Registry to track registered FCM tokens
let fcmTokens = new Set();

async function loadFcmTokens() {
  if (pool) {
    try {
      const res = await pool.query('SELECT token FROM fcm_tokens');
      fcmTokens = new Set(res.rows.map(row => row.token));
      console.log(`Loaded ${fcmTokens.size} FCM token(s) from database.`);
    } catch (error) {
      console.error('Error loading FCM tokens from database:', error);
    }
  } else {
    try {
      if (fs.existsSync(FCM_TOKENS_FILE)) {
        const data = fs.readFileSync(FCM_TOKENS_FILE, 'utf8');
        const tokensArray = JSON.parse(data);
        fcmTokens = new Set(tokensArray);
        console.log(`Loaded ${fcmTokens.size} FCM token(s) from registry.`);
      }
    } catch (error) {
      console.error('Error loading FCM tokens:', error);
    }
  }
}

async function saveFcmToken(token) {
  if (!token || fcmTokens.has(token)) return;
  fcmTokens.add(token);
  if (pool) {
    try {
      await pool.query('INSERT INTO fcm_tokens (token) VALUES ($1) ON CONFLICT (token) DO NOTHING', [token]);
      console.log('FCM token registered and saved to database.');
    } catch (error) {
      console.error('Error saving FCM token to database:', error);
    }
  } else {
    try {
      fs.writeFileSync(FCM_TOKENS_FILE, JSON.stringify(Array.from(fcmTokens), null, 2), 'utf8');
      console.log('FCM token registered and saved to database.');
    } catch (error) {
      console.error('Error saving FCM tokens:', error);
    }
  }
}

async function removeFcmToken(token) {
  if (!token) return;
  fcmTokens.delete(token);
  if (pool) {
    try {
      await pool.query('DELETE FROM fcm_tokens WHERE token = $1', [token]);
      console.log('FCM token removed from database.');
    } catch (error) {
      console.error('Error deleting FCM token from database:', error);
    }
  } else {
    try {
      fs.writeFileSync(FCM_TOKENS_FILE, JSON.stringify(Array.from(fcmTokens), null, 2), 'utf8');
    } catch (error) {
      console.error('Error updating FCM tokens file:', error);
    }
  }
}

// Global notification trigger helper
function sendPushNotification(title, body, dataPayload = {}) {
  if (!pushEnabled || fcmTokens.size === 0) {
    console.log(`Push notifications skipped. PushEnabled: ${pushEnabled}, Active FCM client count: ${fcmTokens.size}`);
    return;
  }

  const tokens = Array.from(fcmTokens);
  console.log(`Sending background push notification to ${tokens.length} client(s)...`);

  const message = {
    notification: {
      title: title,
      body: body
    },
    data: {
      ...dataPayload,
      click_action: 'FLUTTER_NOTIFICATION_CLICK'
    },
    android: {
      priority: 'high',
      notification: {
        sound: 'default',
        channelId: 'pos_high_importance_channel',
        priority: 'max',
        visibility: 'public'
      }
    }
  };

  tokens.forEach(token => {
    getMessaging().send({
      ...message,
      token: token
    })
    .then((response) => {
      console.log('Successfully sent push notification to token:', token.substring(0, 10) + '...');
    })
    .catch((error) => {
      console.error('Error sending message to token:', token.substring(0, 10) + '...', error.code);
      if (error.code === 'messaging/registration-token-not-registered' || error.code === 'messaging/invalid-argument') {
        console.log('Removing inactive FCM token:', token.substring(0, 10) + '...');
        removeFcmToken(token);
      }
    });
  });
}

// Initial default state
const defaultMenu = [
  { id: '1', name: 'Hủ tiếu nước', price: 40000 },
  { id: '2', name: 'Hủ tiếu khô', price: 40000 },
  { id: '3', name: 'Mì tươi nước', price: 40000 },
  { id: '4', name: 'Mì tươi khô', price: 40000 },
  { id: '5', name: 'Hủ tiếu Mì nước', price: 40000 },
  { id: '6', name: 'Hủ tiếu Mì khô', price: 40000 },
  { id: '7', name: 'Mì gói nước', price: 40000 },
  { id: '8', name: 'Mì gói khô', price: 40000 }
];

const defaultQuickNotes = [
  'Không hành',
  'Không giá',
  'Không tóp mỡ',
  'Nhiều tóp mỡ',
  'Nước béo',
  'Nước trong',
  'Nhiều thịt',
  'Mì dai',
  'Mì mềm'
];

const initialTables = {
  "Bàn 1": { items: [], startTime: null, status: 'empty' },
  "Bàn 2": { items: [], startTime: null, status: 'empty' },
  "Bàn 3": { items: [], startTime: null, status: 'empty' },
  "Bàn 4": { items: [], startTime: null, status: 'empty' },
  "Bàn 5": { items: [], startTime: null, status: 'empty' },
  "Bàn 6": { items: [], startTime: null, status: 'empty' }
};

let state = {
  tables: { ...initialTables },
  menu: [...defaultMenu],
  quickNotes: [...defaultQuickNotes],
  kitchenOrders: [], // Active orders currently in the kitchen
  history: []       // Completed historical transactions
};

// Load state from file or PostgreSQL database
async function loadState() {
  if (pool) {
    try {
      const res = await pool.query("SELECT value FROM system_state WHERE key = 'current_state'");
      if (res.rows.length > 0) {
        const loaded = JSON.parse(res.rows[0].value);
        state.tables = loaded.tables || { ...initialTables };
        
        // Clean up legacy static 'Mang Về' table if it exists
        if (state.tables["Mang Về"]) {
          delete state.tables["Mang Về"];
        }
        
        state.menu = loaded.menu || [...defaultMenu];
        state.quickNotes = loaded.quickNotes || [...defaultQuickNotes];
        state.kitchenOrders = loaded.kitchenOrders || [];
        state.history = loaded.history || [];
        console.log('State loaded successfully from database.');
      } else {
        console.log('No state found in database, using default state.');
      }
    } catch (error) {
      console.error('Error loading state from database, using default state:', error);
    }
  } else {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const data = fs.readFileSync(STATE_FILE, 'utf8');
        const loaded = JSON.parse(data);
        // Merge with initialTables and defaultMenu
        state.tables = loaded.tables || { ...initialTables };
        
        // Clean up legacy static 'Mang Về' table if it exists
        if (state.tables["Mang Về"]) {
          delete state.tables["Mang Về"];
        }
        
        state.menu = loaded.menu || [...defaultMenu];
        state.quickNotes = loaded.quickNotes || [...defaultQuickNotes];
        state.kitchenOrders = loaded.kitchenOrders || [];
        state.history = loaded.history || [];
        console.log('State loaded successfully from file.');
      }
    } catch (error) {
      console.error('Error loading state from file, using default state:', error);
    }
  }
}

// Save state to file or PostgreSQL database
async function saveState() {
  if (pool) {
    try {
      const valStr = JSON.stringify(state);
      await pool.query(
        "INSERT INTO system_state (key, value) VALUES ('current_state', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
        [valStr]
      );
    } catch (error) {
      console.error('Error saving state to database:', error);
    }
  } else {
    try {
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
    } catch (error) {
      console.error('Error saving state to file:', error);
    }
  }
}


app.use(cors());
app.use(express.json());

// Serve React production build static assets if exists
const buildPath = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(buildPath)) {
  app.use(express.static(buildPath));
  console.log(`Serving static files from: ${buildPath}`);
  
  // SPA routing: send index.html for all non-API requests
  app.get('*', (req, res, next) => {
    if (req.url.startsWith('/api') || req.url.startsWith('/socket.io')) {
      return next();
    }
    res.sendFile(path.join(buildPath, 'index.html'));
  });
} else {
  console.log('Frontend build directory not found. Server running in API-only mode.');
}

// REST API for stats and raw data access
app.get('/api/state', (req, res) => {
  res.json(state);
});

app.get('/api/stats', (req, res) => {
  // Calculate total revenue from history
  const totalRevenue = state.history.reduce((sum, order) => sum + (order.totalPrice || 0), 0);
  
  // Count items sold
  const itemsSold = {};
  state.history.forEach(order => {
    order.items.forEach(item => {
      itemsSold[item.name] = (itemsSold[item.name] || 0) + 1;
    });
  });
  
  // Format history logs
  const historyList = [...state.history].reverse(); // newest first
  
  res.json({
    totalRevenue,
    orderCount: state.history.length,
    itemsSold,
    historyList
  });
});

app.post('/api/reset-stats', (req, res) => {
  state.history = [];
  saveState();
  io.emit('state-update', state);
  res.json({ success: true, message: 'Stats cleared successfully' });
});

// Socket.io Real-time implementation
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  
  // Send current state on connection
  socket.emit('state-update', state);

  socket.on('disconnect', (reason) => {
    console.log(`Client disconnected: ${socket.id}, reason: ${reason}`);
  });

  // When order is placed by POS client
  socket.on('place-order', ({ tableName, items }) => {
    if (!state.tables[tableName]) {
      socket.emit('error', 'Bàn không hợp lệ');
      return;
    }

    console.log(`Order placed for ${tableName}:`, items);

    const now = new Date();
    const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    // Update table info
    const table = state.tables[tableName];
    if (table.items.length === 0) {
      table.startTime = timeStr;
    }
    table.status = 'cooking';
    
    // Add items to table order (sorted alphabetically by food name)
    table.items = [...table.items, ...items].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    
    // Create new kitchen ticket (sorted alphabetically by food name)
    const newKitchenOrder = {
      id: Date.now() + Math.random().toString(36).substr(2, 5), // unique ticket ID
      tableName,
      time: timeStr,
      timestamp: Date.now(),
      items: items.map(item => ({
        ...item,
        completed: false // individual checklist
      })).sort((a, b) => a.name.localeCompare(b.name, 'vi')),
      status: 'cooking'
    };
    
    state.kitchenOrders.push(newKitchenOrder);
    saveState();
    
    // Broadcast state update to all clients
    io.emit('state-update', state);
    // Specifically trigger kitchen notification sound event
    io.emit('new-kitchen-order', { tableName, time: timeStr });

    // Send native background push notification to all mobile devices
    sendPushNotification(
      '🍳 Đơn hàng mới!',
      `Bàn/Phòng: ${tableName} vừa gọi món mới.`,
      { type: 'new-order', tableName }
    );
  });

  // Toggle state of an individual item in a kitchen ticket (checked/unchecked)
  socket.on('toggle-kitchen-item', ({ orderId, itemIndex }) => {
    const order = state.kitchenOrders.find(o => o.id === orderId);
    if (order && order.items[itemIndex]) {
      order.items[itemIndex].completed = !order.items[itemIndex].completed;
      saveState();
      io.emit('state-update', state);
    }
  });

  // Complete a kitchen ticket
  socket.on('complete-kitchen-order', (orderId) => {
    const orderIndex = state.kitchenOrders.findIndex(o => o.id === orderId);
    if (orderIndex !== -1) {
      const order = state.kitchenOrders[orderIndex];
      
      // Update table status if appropriate
      const tableName = order.tableName;
      const table = state.tables[tableName];
      if (table) {
        table.status = 'served';
      }
      
      // Remove or mark order completed
      state.kitchenOrders.splice(orderIndex, 1);
      saveState();
      
      io.emit('state-update', state);
      // Trigger served notification audio event on POS
      io.emit('order-served', { tableName });

      // Send native background push notification to all mobile devices
      sendPushNotification(
        '✅ Món ăn hoàn thành',
        `${tableName} đã chế biến xong. Hãy phục vụ khách!`,
        { type: 'served', tableName }
      );
    }
  });

  // Cancel/delete an active kitchen ticket
  socket.on('cancel-kitchen-order', (orderId) => {
    const orderIndex = state.kitchenOrders.findIndex(o => o.id === orderId);
    if (orderIndex !== -1) {
      const order = state.kitchenOrders[orderIndex];
      const tableName = order.tableName;
      
      state.kitchenOrders.splice(orderIndex, 1);
      
      // If table has no other cooking items, revert its status
      const hasOtherCooking = state.kitchenOrders.some(o => o.tableName === tableName);
      if (!hasOtherCooking && state.tables[tableName]) {
        state.tables[tableName].status = state.tables[tableName].items.length > 0 ? 'served' : 'empty';
      }
      
      saveState();
      io.emit('state-update', state);
    }
  });

  // Create a new dynamic takeaway table ticket
  socket.on('create-takeaway', () => {
    const prefix = 'Mang Về ';
    const activeTakeaways = Object.keys(state.tables).filter(k => k.startsWith(prefix));
    
    let nextNumber = 1;
    // Find the lowest available number
    while (state.tables[`${prefix}${nextNumber}`]) {
      nextNumber++;
    }
    
    const newKey = `${prefix}${nextNumber}`;
    const now = new Date();
    const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    
    state.tables[newKey] = {
      items: [],
      startTime: timeStr,
      status: 'empty'
    };
    
    console.log(`Created dynamic takeaway ticket: ${newKey}`);
    saveState();
    io.emit('state-update', state);
    
    // Send dynamic feedback to requesting socket client to automatically select it
    socket.emit('takeaway-created', newKey);
  });

  // Clear/Pay table
  socket.on('clear-table', (tableName) => {
    if (!state.tables[tableName]) return;
    
    const table = state.tables[tableName];
    if (table.items.length > 0) {
      // Calculate price dynamically from each item
      const totalPrice = table.items.reduce((sum, item) => sum + (item.price || 40000), 0);
      const now = new Date();
      const endTimeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      
      // Save order to history
      const historicalRecord = {
        id: Date.now().toString(),
        tableName,
        startTime: table.startTime,
        endTime: endTimeStr,
        date: now.toLocaleDateString('vi-VN'),
        items: [...table.items],
        totalPrice
      };
      state.history.push(historicalRecord);
    }
    
    // If it's a dynamic takeaway table, delete the key entirely to keep the screen clean!
    if (tableName.startsWith('Mang Về ')) {
      delete state.tables[tableName];
      console.log(`Deleted dynamic takeaway ticket: ${tableName}`);
    } else {
      // Reset standard physical table
      state.tables[tableName] = { items: [], startTime: null, status: 'empty' };
    }
    
    // Also remove any active kitchen orders for this table
    state.kitchenOrders = state.kitchenOrders.filter(o => o.tableName !== tableName);
    
    saveState();
    io.emit('state-update', state);
  });

  // Force reset entire state (for debugging)
  socket.on('reset-all', () => {
    state.tables = {
      "Bàn 1": { items: [], startTime: null, status: 'empty' },
      "Bàn 2": { items: [], startTime: null, status: 'empty' },
      "Bàn 3": { items: [], startTime: null, status: 'empty' },
      "Bàn 4": { items: [], startTime: null, status: 'empty' },
      "Bàn 5": { items: [], startTime: null, status: 'empty' },
      "Bàn 6": { items: [], startTime: null, status: 'empty' }
    };
    state.menu = [...defaultMenu];
    state.quickNotes = [...defaultQuickNotes];
    state.kitchenOrders = [];
    saveState();
    io.emit('state-update', state);
  });

  // Admin: Add quick note
  socket.on('admin-add-quick-note', (noteText) => {
    const trimmed = noteText ? noteText.trim() : '';
    if (trimmed && !state.quickNotes.includes(trimmed)) {
      state.quickNotes.push(trimmed);
      saveState();
      io.emit('state-update', state);
    }
  });

  // Admin: Delete quick note
  socket.on('admin-delete-quick-note', (noteText) => {
    state.quickNotes = state.quickNotes.filter(n => n !== noteText);
    saveState();
    io.emit('state-update', state);
  });

  // Admin: Edit quick note
  socket.on('admin-edit-quick-note', ({ oldNote, newNote }) => {
    const trimmedNew = newNote ? newNote.trim() : '';
    if (trimmedNew && oldNote) {
      const idx = state.quickNotes.indexOf(oldNote);
      if (idx !== -1) {
        state.quickNotes[idx] = trimmedNew;
        saveState();
        io.emit('state-update', state);
      }
    }
  });

  // Admin: Add menu item
  socket.on('admin-add-menu-item', ({ name, price }) => {
    const newItem = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      name: name.trim(),
      price: Number(price) || 0
    };
    state.menu.push(newItem);
    saveState();
    io.emit('state-update', state);
  });

  // Admin: Edit menu item
  socket.on('admin-edit-menu-item', ({ id, name, price }) => {
    const item = state.menu.find(m => m.id === id);
    if (item) {
      item.name = name.trim();
      item.price = Number(price) || 0;
      saveState();
      io.emit('state-update', state);
    }
  });

  // Admin: Delete menu item
  socket.on('admin-delete-menu-item', (id) => {
    state.menu = state.menu.filter(m => m.id !== id);
    saveState();
    io.emit('state-update', state);
  });

  // Admin: Add table
  socket.on('admin-add-table', (tableName) => {
    const trimmed = tableName.trim();
    if (trimmed && !state.tables[trimmed]) {
      state.tables[trimmed] = { items: [], startTime: null, status: 'empty' };
      saveState();
      io.emit('state-update', state);
    }
  });

  // Admin: Delete table
  socket.on('admin-delete-table', (tableName) => {
    if (state.tables[tableName]) {
      if (state.tables[tableName].status !== 'empty' || state.tables[tableName].items.length > 0) {
        socket.emit('error-msg', 'Không thể xóa bàn đang có khách hoặc đang chế biến!');
        return;
      }
      delete state.tables[tableName];
      saveState();
      io.emit('state-update', state);
    }
  });

  // Register device FCM token for push notifications
  socket.on('register-fcm-token', (token) => {
    console.log(`FCM Token registration request from client ${socket.id}`);
    saveFcmToken(token);
  });
});

(async () => {
  await initDatabase();
  await loadFcmTokens();
  await loadState();

  server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
})();
