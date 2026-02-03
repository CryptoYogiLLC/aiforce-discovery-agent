import { useEffect, useRef, useCallback, useState } from "react";
import type { DryrunSession, DryrunDiscovery, DryrunContainer } from "../types";

export type DryRunUpdateType =
  | "status"
  | "progress"
  | "discovery"
  | "container"
  | "error";

export interface DryRunUpdate {
  type: DryRunUpdateType;
  data: unknown;
}

export interface CollectorStatus {
  name: string;
  status: "pending" | "running" | "completed" | "failed";
  progress: number;
  discovery_count: number;
}

interface UseDryRunWebSocketOptions {
  sessionId: string | null;
  onStatusUpdate?: (session: Partial<DryrunSession>) => void;
  onDiscovery?: (discovery: DryrunDiscovery) => void;
  onContainerUpdate?: (container: DryrunContainer) => void;
  onCollectorProgress?: (collector: CollectorStatus) => void;
  onError?: (error: string) => void;
}

export function useDryRunWebSocket({
  sessionId,
  onStatusUpdate,
  onDiscovery,
  onContainerUpdate,
  onCollectorProgress,
  onError,
}: UseDryRunWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const maxReconnectAttempts = 5;

  const connect = useCallback(() => {
    if (!sessionId) return;

    // Determine WebSocket URL based on current location
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/dryrun/ws?session_id=${sessionId}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setReconnectAttempts(0);
      };

      ws.onmessage = (event) => {
        try {
          const update: DryRunUpdate = JSON.parse(event.data);

          switch (update.type) {
            case "status":
              onStatusUpdate?.(update.data as Partial<DryrunSession>);
              break;
            case "discovery":
              onDiscovery?.(update.data as DryrunDiscovery);
              break;
            case "container":
              onContainerUpdate?.(update.data as DryrunContainer);
              break;
            case "progress":
              onCollectorProgress?.(update.data as CollectorStatus);
              break;
            case "error":
              onError?.(update.data as string);
              break;
          }
        } catch (err) {
          console.error("Failed to parse WebSocket message:", err);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;

        // Attempt reconnection with exponential backoff
        if (reconnectAttempts < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
          reconnectTimeoutRef.current = window.setTimeout(() => {
            setReconnectAttempts((prev) => prev + 1);
            connect();
          }, delay);
        }
      };

      ws.onerror = () => {
        onError?.("WebSocket connection error");
      };
    } catch (err) {
      console.error("Failed to create WebSocket:", err);
      onError?.("Failed to establish WebSocket connection");
    }
  }, [
    sessionId,
    reconnectAttempts,
    onStatusUpdate,
    onDiscovery,
    onContainerUpdate,
    onCollectorProgress,
    onError,
  ]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  useEffect(() => {
    if (sessionId) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [sessionId, connect, disconnect]);

  return {
    isConnected,
    reconnectAttempts,
    disconnect,
    reconnect: connect,
  };
}
