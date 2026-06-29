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

const PORT = process.env.PORT || 3005;
const STATE_FILE = path.join(__dirname, 'data', 'state.json');

// Ensure data directory exists
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
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

const initialTables = {
  "Bàn 1": { items: [], startTime: null, status: 'empty' },
  "Bàn 2": { items: [], startTime: null, status: 'empty' },
  "Bàn 3": { items: [], startTime: null, status: 'empty' },
  "Bàn 4": { items: [], startTime: null, status: 'empty' },
  "Bàn 5": { items: [], startTime: null, status: 'empty' },
  "Bàn 6": { items: [], startTime: null, status: 'empty' },
  "Mang Về": { items: [], startTime: null, status: 'empty' }
};

let state = {
  tables: { ...initialTables },
  menu: [...defaultMenu],
  kitchenOrders: [], // Active orders currently in the kitchen
  history: []       // Completed historical transactions
};

// Load state from file if exists
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf8');
      const loaded = JSON.parse(data);
      // Merge with initialTables and defaultMenu
      state.tables = loaded.tables || { ...initialTables };
      state.menu = loaded.menu || [...defaultMenu];
      state.kitchenOrders = loaded.kitchenOrders || [];
      state.history = loaded.history || [];
      console.log('State loaded successfully from file.');
    }
  } catch (error) {
    console.error('Error loading state from file, using default state:', error);
  }
}

// Save state to file
function saveState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving state to file:', error);
  }
}

loadState();


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
    
    // Add items to table order
    table.items = [...table.items, ...items];
    
    // Create new kitchen ticket
    const newKitchenOrder = {
      id: Date.now() + Math.random().toString(36).substr(2, 5), // unique ticket ID
      tableName,
      time: timeStr,
      timestamp: Date.now(),
      items: items.map(item => ({
        ...item,
        completed: false // individual checklist
      })),
      status: 'cooking'
    };
    
    state.kitchenOrders.push(newKitchenOrder);
    saveState();
    
    // Broadcast state update to all clients
    io.emit('state-update', state);
    // Specifically trigger kitchen notification sound event
    io.emit('new-kitchen-order', { tableName, time: timeStr });
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
    
    // Reset table
    state.tables[tableName] = { items: [], startTime: null, status: 'empty' };
    
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
      "Bàn 6": { items: [], startTime: null, status: 'empty' },
      "Mang Về": { items: [], startTime: null, status: 'empty' }
    };
    state.menu = [...defaultMenu];
    state.kitchenOrders = [];
    saveState();
    io.emit('state-update', state);
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

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
