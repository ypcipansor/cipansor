import { useEffect, useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";
import { DashboardMetrics } from "@cipansor/shared";

interface DashboardAlert {
  id: string;
  unitId?: string;
  metricType: string;
  message: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  timestamp: string;
}

interface UseRealtimeDashboardOptions {
  enabled?: boolean;
  unitIds?: string[];
  metrics?: string[];
  onMetricsUpdate?: (data: DashboardMetrics) => void;
  onAlert?: (alert: DashboardAlert) => void;
}

export function useRealtimeDashboard(
  options: UseRealtimeDashboardOptions = {},
) {
  const {
    enabled = true,
    unitIds = [],
    metrics = ["students", "attendance", "tahfidz"],
    onMetricsUpdate,
    onAlert,
  } = options;

  const queryClient = useQueryClient();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Memoize unitIds and metrics to prevent unnecessary re-connections
  const memoizedUnitIds = useDeepCompareMemoize(unitIds);
  const memoizedMetrics = useDeepCompareMemoize(metrics);

  // Callbacks in refs so a changing handler does not tear down the socket.
  const onMetricsUpdateRef = useRef(onMetricsUpdate);
  const onAlertRef = useRef(onAlert);

  useEffect(() => {
    onMetricsUpdateRef.current = onMetricsUpdate;
    onAlertRef.current = onAlert;
  }, [onMetricsUpdate, onAlert]);

  useEffect(() => {
    if (!enabled) return;

    // Connect to WebSocket server.
    //
    // NEXT_PUBLIC_WS_URL has never been set — not in .env, .env.example,
    // docker-compose.yml or the deploy scripts — so in production this fell
    // through to the localhost default and every visitor's browser tried to
    // open a socket to port 3001 *on their own machine*. Realtime on the
    // executive dashboard has therefore never worked outside local dev.
    //
    // Passing `undefined` makes socket.io connect to the origin that served the
    // page, which is right for both cipansor.or.id and portal.cipansor.or.id
    // and needs no per-host build. The env var stays as an override for `pnpm
    // dev`, where the web server (:3000) and the API (:3001) differ.
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || undefined;

    // Create socket instance
    const newSocket = io(wsUrl, {
      // The session cookie is `HttpOnly`; there is no token for JS to hand over.
      // Send the cookie with the handshake instead.
      withCredentials: true,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      reconnectionAttempts: Infinity, // Keep trying
      timeout: 10000, // 10 second connection timeout
    });

    setSocket(newSocket);

    // Connection handlers
    newSocket.on("connect", () => {
      console.log("✅ WebSocket connected");
      setIsConnected(true);
      setReconnectAttempts(0);
      setConnectionError(null);

      toast.success("Dashboard terhubung", { duration: 2000 });

      // Subscribe to dashboard updates
      newSocket.emit("dashboard:subscribe", {
        unitIds:
          memoizedUnitIds && memoizedUnitIds.length > 0
            ? memoizedUnitIds
            : ["all"],
        metrics: memoizedMetrics,
      });
    });

    newSocket.on("disconnect", (reason: string) => {
      console.log("❌ WebSocket disconnected:", reason);
      setIsConnected(false);

      if (reason === "io server disconnect") {
        // Server forcefully disconnected - probably auth issue
        setConnectionError("Authentication failed. Please login again.");
        toast.error("Sesi berakhir. Silakan login kembali.");
      } else if (reason === "transport close" || reason === "ping timeout") {
        // Network issue - will auto-reconnect
        toast.warning("Koneksi terputus. Mencoba menghubungkan kembali...", {
          duration: 3000,
        });
      }
    });

    newSocket.on("connect_error", (error: Error) => {
      console.error("❌ WebSocket connection error:", error.message);
      setIsConnected(false);
      setConnectionError(error.message);

      setReconnectAttempts((prev) => {
        const attempts = prev + 1;
        if (attempts === 1) {
          toast.error("Gagal terhubung ke server");
        } else if (attempts === 5) {
          toast.error(
            "Masih mencoba terhubung... Periksa koneksi internet Anda.",
          );
        }
        return attempts;
      });
    });

    // Metrics update handler
    newSocket.on("metrics:update", (data: DashboardMetrics) => {
      console.log("📊 Metrics update received:", data);
      setLastUpdate(new Date());

      // Update React Query cache
      queryClient.setQueryData(["dashboard-metrics"], (old: any) => ({
        ...old,
        ...data,
      }));

      // Call custom handler if provided
      onMetricsUpdateRef.current?.(data);
    });

    // Alert handler
    newSocket.on("alert:new", (alert: DashboardAlert) => {
      console.log("🚨 Alert received:", alert);

      // Add new alert to cache
      queryClient.setQueryData(
        ["dashboard-alerts"],
        (old: DashboardAlert[] = []) => [alert, ...old],
      );

      // Show toast notification based on severity
      const toastOptions = {
        duration: alert.severity === "CRITICAL" ? 10000 : 5000,
      };

      switch (alert.severity) {
        case "CRITICAL":
          toast.error(alert.message, toastOptions);
          break;
        case "WARNING":
          toast.warning(alert.message, toastOptions);
          break;
        case "INFO":
          toast.info(alert.message, toastOptions);
          break;
      }

      // Call custom handler if provided
      onAlertRef.current?.(alert);
    });

    // Reconnection handlers
    newSocket.on("reconnect", (attemptNumber: number) => {
      console.log("🔄 Reconnected after", attemptNumber, "attempts");
      setReconnectAttempts(0);
      setConnectionError(null);
      toast.success("Dashboard terhubung kembali");
    });

    newSocket.on("reconnect_attempt", (attemptNumber: number) => {
      console.log("🔄 Reconnection attempt", attemptNumber);
      setReconnectAttempts(attemptNumber);
    });

    newSocket.on("reconnect_error", (error: Error) => {
      console.error("❌ Reconnection error:", error.message);
    });

    newSocket.on("reconnect_failed", () => {
      console.error("❌ Failed to reconnect after maximum attempts");
      setConnectionError("Unable to connect to server");
      toast.error(
        "Gagal terhubung ke dashboard real-time. Silakan refresh halaman.",
      );
    });

    // Cleanup on unmount
    return () => {
      console.log("🔌 Closing WebSocket connection");
      newSocket.close();
      setSocket(null);
    };
    // We intentionally omit reconnectAttempts from deps to avoid reconnecting on attempt increment
  }, [enabled, queryClient, memoizedUnitIds, memoizedMetrics]);

  // Manual subscription update
  const updateSubscription = useCallback(
    (newUnitIds: string[], newMetrics: string[]) => {
      if (socket && isConnected) {
        socket.emit("dashboard:subscribe", {
          unitIds: newUnitIds,
          metrics: newMetrics,
        });
      }
    },
    [socket, isConnected],
  );

  // Manual disconnect
  const disconnect = useCallback(() => {
    if (socket) {
      socket.close();
      setSocket(null);
      setIsConnected(false);
    }
  }, [socket]);

  // Manual reconnect
  const reconnect = useCallback(() => {
    if (socket && !isConnected) {
      console.log("🔄 Manual reconnect triggered");
      setReconnectAttempts(0);
      socket.connect();
    }
  }, [socket, isConnected]);

  // Subscribe to specific unit
  const subscribeToUnit = useCallback(
    (unitId: string) => {
      if (socket && isConnected) {
        socket.emit("subscribe:unit-dashboard", { unitId });
      }
    },
    [socket, isConnected],
  );

  return {
    socket,
    isConnected,
    lastUpdate,
    reconnectAttempts,
    connectionError,
    updateSubscription,
    disconnect,
    reconnect,
    subscribeToUnit,
  };
}

// Hook for dashboard alerts with pagination
export function useDashboardAlerts(
  params: { page?: number; limit?: number } = {},
) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { page = 1, limit = 20 } = params;

  return (
    useQueryClient().getQueryData<DashboardAlert[]>(["dashboard-alerts"]) || []
  );
}

// Helper for deep comparison of string arrays
function areArraysEqual(a: string[] | undefined, b: string[] | undefined) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function useDeepCompareMemoize(value: string[] | undefined) {
  const [ref, setRef] = useState<string[] | undefined>(value);
  if (!areArraysEqual(value, ref)) {
    setRef(value);
  }
  return ref;
}
