// socket.ts - Updated to use SocketManager
import SocketManager from './socketManager.tsx';

// Export the managed socket instance
export const socket = SocketManager.getInstance().connect();
