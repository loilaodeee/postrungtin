import { io } from 'socket.io-client';

// Detect if we are running in Vite dev mode (port 5173/5174).
// If in dev, connect to backend on port 3005. Otherwise, connect to the same host/port.
const isDev = window.location.port === '5173' || window.location.port === '5174';
const URL = isDev ? `http://${window.location.hostname}:3005` : '/';

export const socket = io(URL, {
  autoConnect: true
});
