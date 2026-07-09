import React, { useState, useEffect } from 'react';
import { ChefHat, ShoppingBag, BarChart3, Settings, X } from 'lucide-react';
import { socket } from './socket';
import OrderScreen from './components/OrderScreen';
import KitchenScreen from './components/KitchenScreen';
import StatsScreen from './components/StatsScreen';
import AdminScreen from './components/AdminScreen';
import './App.css';

// Reusable global AudioContext for mobile web browsers to bypass gesture block
let globalAudioCtx = null;

const initAudio = () => {
  if (globalAudioCtx) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      globalAudioCtx = new AudioContextClass();
      console.log('Global AudioContext initialized.');
    }
  } catch (err) {
    console.error('Failed to initialize AudioContext:', err);
  }
};

const resumeAudio = () => {
  try {
    initAudio();
    const ctx = globalAudioCtx;
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().then(() => {
        console.log('Global AudioContext resumed successfully.');
      });
    }

    // Play a quick silent buffer. This is REQUIRED to unlock Web Audio on iOS Safari
    // because iOS requires an actual audio source play start within a user gesture.
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
    console.log('iOS Safari Audio unlocked successfully with silent buffer.');
  } catch (error) {
    console.error('Failed to resume/unlock audio context:', error);
  }
};

const playSound = (type) => {
  try {
    initAudio();
    const ctx = globalAudioCtx;
    if (!ctx) return;

    // Force resume state if suspended
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    
    if (type === 'new-order') {
      // Triple high-pitched urgent beeps at high volume (gain: 0.6)
      const playSingleBeep = (time) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(987.77, time); // B5 (High alarm)
        gain.gain.setValueAtTime(0.6, time); // 60% Volume
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15); // quick fade
        
        osc.start(time);
        osc.stop(time + 0.2);
      };

      const now = ctx.currentTime;
      playSingleBeep(now);
      playSingleBeep(now + 0.18);
      playSingleBeep(now + 0.36);
    } else if (type === 'served') {
      // Play a high double-ding bell sound
      const playBell = (time, freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, time);
        gain.gain.setValueAtTime(0.6, time); // 60% Volume (Loud!)
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
        
        osc.start(time);
        osc.stop(time + 0.35);
      };

      const now = ctx.currentTime;
      playBell(now, 987.77); // B5 (High bell)
      playBell(now + 0.15, 1318.51); // E6 (Higher bell)
    }
  } catch (err) {
    console.error('Audio play error:', err);
  }
};

function App() {
  const [activeTab, setActiveTab] = useState('order'); // 'order' | 'kitchen' | 'stats' | 'admin'
  const [systemState, setSystemState] = useState({
    tables: {},
    menu: [],
    kitchenOrders: [],
    history: []
  });
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [toasts, setToasts] = useState([]);

  const triggerToast = (title, message, type) => {
    const id = Date.now() + Math.random().toString(36).substr(2, 5);
    const newToast = { id, title, message, type };
    setToasts(prev => [...prev, newToast]);

    // Auto-remove after 4.5 seconds to sync with slideUp animation
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  };

  useEffect(() => {
    // Connect socket on mount
    socket.connect();

    function onConnect() {
      setIsConnected(true);
      console.log('Socket connected successfully');
    }

    function onDisconnect() {
      setIsConnected(false);
      console.log('Socket disconnected');
    }

    function onStateUpdate(newState) {
      console.log('System state updated:', newState);
      setSystemState(newState);
    }

    function onNewKitchenOrder({ tableName, time }) {
      console.log('New kitchen order received globally!');
      playSound('new-order');
      if (Notification.permission === 'granted') {
        new Notification('🔥 Đơn Hàng Mới', {
          body: `${tableName} vừa gửi đơn lúc ${time}!`
        });
      }
      triggerToast('🔥 Đơn Hàng Mới', `${tableName} vừa gửi đơn lúc ${time}!`, 'order');
    }

    function onOrderServed({ tableName }) {
      console.log(`Order served for ${tableName}!`);
      playSound('served');
      if (Notification.permission === 'granted') {
        new Notification('🔔 Đơn hàng hoàn thành', {
          body: `${tableName} đã chế biến xong! Vui lòng giao món.`
        });
      }
      triggerToast('🔔 Đơn Hàng Hoàn Thành', `${tableName} đã chế biến xong! Vui lòng giao món.`, 'served');
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('state-update', onStateUpdate);
    socket.on('new-kitchen-order', onNewKitchenOrder);
    socket.on('order-served', onOrderServed);

    // Request browser notification permissions
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('state-update', onStateUpdate);
      socket.off('new-kitchen-order', onNewKitchenOrder);
      socket.off('order-served', onOrderServed);
    };
  }, []);

  // Unlock audio context on user gesture for mobile devices
  useEffect(() => {
    const handleGesture = () => {
      resumeAudio();
    };
    window.addEventListener('click', handleGesture);
    window.addEventListener('touchstart', handleGesture);
    return () => {
      window.removeEventListener('click', handleGesture);
      window.removeEventListener('touchstart', handleGesture);
    };
  }, []);

  // Handlers communicating with Node.js Server
  const handlePlaceOrder = (tableName, items) => {
    socket.emit('place-order', { tableName, items });
  };

  const handleClearTable = (tableName) => {
    socket.emit('clear-table', tableName);
  };

  const handleToggleKitchenItem = (orderId, itemIndex) => {
    socket.emit('toggle-kitchen-item', { orderId, itemIndex });
  };

  const handleCompleteKitchenOrder = (orderId) => {
    socket.emit('complete-kitchen-order', orderId);
  };

  const handleCancelKitchenOrder = (orderId) => {
    socket.emit('cancel-kitchen-order', orderId);
  };

  const activeKitchenCount = systemState.kitchenOrders?.length || 0;

  return (
    <div className="app-root" onClick={resumeAudio} onTouchStart={resumeAudio}>
      <header className="app-header">
        <div className="brand-section">
          <div className="brand-icon">
            <ChefHat size={22} />
          </div>
          <div>
            <span className="brand-name">HỦ TIẾU TRUNG TÍN</span>
            <span className="brand-badge">POS v2.0 Realtime</span>
          </div>
        </div>

        <nav className="app-nav">
          <button
            className={`nav-tab-btn ${activeTab === 'order' ? 'active' : ''}`}
            onClick={() => setActiveTab('order')}
          >
            <ShoppingBag size={18} />
            <span>Phục Vụ</span>
          </button>
          
          <button
            className={`nav-tab-btn ${activeTab === 'kitchen' ? 'active' : ''}`}
            onClick={() => setActiveTab('kitchen')}
          >
            <ChefHat size={18} />
            <span>Bếp</span>
            {activeKitchenCount > 0 && (
              <span className="tab-badge animate-pop">{activeKitchenCount}</span>
            )}
          </button>
          
          <button
            className={`nav-tab-btn ${activeTab === 'stats' ? 'active' : ''}`}
            onClick={() => setActiveTab('stats')}
          >
            <BarChart3 size={18} />
            <span>Báo Cáo</span>
          </button>

          <button
            className={`nav-tab-btn ${activeTab === 'admin' ? 'active' : ''}`}
            onClick={() => setActiveTab('admin')}
          >
            <Settings size={18} />
            <span>Cài Đặt</span>
          </button>
        </nav>
        
        <div className="connection-status-indicator" style={{ display: 'flex', alignItems: 'center' }}>
          <a 
            href="https://drive.google.com/file/d/1V6h7ErUMSp5xewp1xgt0ruWmcbuluri0/view?usp=sharing" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="btn-download-app" 
            style={{ 
              marginRight: '16px', 
              textDecoration: 'none', 
              color: '#3b82f6', 
              fontWeight: '800', 
              fontSize: '13px', 
              backgroundColor: '#eff6ff',
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid #bfdbfe'
            }}
          >
            📥 Tải App
          </a>
          <span 
            className={`status-dot ${isConnected ? 'online' : 'offline'}`}
            title={isConnected ? 'Đang kết nối thời gian thực' : 'Mất kết nối server'}
          ></span>
          <style>{`
            .status-dot {
              display: inline-block;
              width: 8px;
              height: 8px;
              border-radius: 50%;
              margin-left: 8px;
            }
            .status-dot.online {
              background-color: var(--success);
              box-shadow: 0 0 8px var(--success);
            }
            .status-dot.offline {
              background-color: var(--danger);
              box-shadow: 0 0 8px var(--danger);
              animation: blink 1s infinite;
            }
            @keyframes blink {
              50% { opacity: 0.3; }
            }
          `}</style>
        </div>
      </header>

      <main className="container-main">
        {activeTab === 'order' && (
          <OrderScreen
            state={systemState}
            onPlaceOrder={handlePlaceOrder}
            onClearTable={handleClearTable}
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
        
        {activeTab === 'stats' && (
          <StatsScreen />
        )}

        {activeTab === 'admin' && (
          <AdminScreen state={systemState} />
        )}
      </main>

      {/* Custom In-App Toast Banner Notifications (drops from top like native push) */}
      <div className="toasts-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast-card-banner animate-slide-down ${t.type}`}>
            <div className="toast-icon-box">
              {t.type === 'order' ? <ChefHat size={20} /> : <BarChart3 size={20} />}
            </div>
            <div className="toast-content-box">
              <h4 className="toast-title">{t.title}</h4>
              <p className="toast-message">{t.message}</p>
            </div>
            <button className="btn-toast-close" onClick={() => setToasts(prev => prev.filter(item => item.id !== t.id))}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
