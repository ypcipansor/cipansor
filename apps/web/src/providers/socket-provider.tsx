"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { io, Socket } from "socket.io-client";
import { useAuthStore } from "@/stores/auth";

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
});

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used within a SocketProvider");
  }
  return context;
}

interface SocketProviderProps {
  children: ReactNode;
}

export function SocketProvider({ children }: SocketProviderProps) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    // Only connect if authenticated
    if (!isAuthenticated) {
      if (socket) {
        socket.disconnect();
        setTimeout(() => setSocket(null), 0);
        setTimeout(() => setIsConnected(false), 0);
      }
      return;
    }

    // Create socket connection
    const socketUrl =
      process.env.NEXT_PUBLIC_SOCKET_URL ||
      (typeof window !== "undefined" ? window.location.origin : "");

    const newSocket = io(socketUrl, {
      path: "/socket.io",
      // The session cookie is `HttpOnly`, so there is no token to put in
      // `auth`. `withCredentials` makes the browser send the cookie with the
      // handshake, which the API's `authenticateSocket` reads.
      withCredentials: true,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    // Connection handlers
    newSocket.on("connect", () => {
      console.log("[Socket] Connected:", newSocket.id);
      setIsConnected(true);
    });

    newSocket.on("disconnect", (reason) => {
      console.log("[Socket] Disconnected:", reason);
      setIsConnected(false);
    });

    newSocket.on("connect_error", (error) => {
      console.error("[Socket] Connection error:", error.message);
      setIsConnected(false);
    });

    // Error handler
    newSocket.on("error", (error) => {
      console.error("[Socket] Error:", error);
    });

    setTimeout(() => setSocket(newSocket), 0);

    // Cleanup
    return () => {
      newSocket.disconnect();
    };
  }, [isAuthenticated]);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
}

// Export for optional manual connection management
export function useSocketConnection() {
  const { socket, isConnected } = useSocket();

  const connect = () => {
    if (socket && !socket.connected) {
      socket.connect();
    }
  };

  const disconnect = () => {
    if (socket && socket.connected) {
      socket.disconnect();
    }
  };

  return { connect, disconnect, isConnected };
}
