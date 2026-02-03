/**
 * SSE hook for real-time log streaming.
 * Reference: GitHub Issue #77
 */
import { useEffect, useRef, useCallback, useState } from "react";
import type { LogEntry, LogLevel } from "../types";
import { api } from "../services/api";

interface UseLogStreamOptions {
  onLog?: (entry: LogEntry) => void;
  onError?: (error: string) => void;
  maxBufferSize?: number;
}

export function useLogStream({
  onLog,
  onError,
  maxBufferSize = 1000,
}: UseLogStreamOptions = {}) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const maxReconnectAttempts = 5;

  const addLog = useCallback(
    (entry: LogEntry) => {
      if (!isPaused) {
        setLogs((prev) => {
          const newLogs = [...prev, entry];
          // Trim to max buffer size
          if (newLogs.length > maxBufferSize) {
            return newLogs.slice(-maxBufferSize);
          }
          return newLogs;
        });
        onLog?.(entry);
      }
    },
    [isPaused, maxBufferSize, onLog],
  );

  const connect = useCallback(() => {
    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    try {
      const url = api.logs.getStreamUrl();
      const eventSource = new EventSource(url, { withCredentials: true });
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setIsConnected(true);
        setReconnectAttempts(0);
      };

      // Handle connected event
      eventSource.addEventListener("connected", () => {
        console.log("Log SSE connected");
      });

      // Handle log events
      eventSource.addEventListener("log", (event) => {
        try {
          const data: LogEntry = JSON.parse(event.data);
          addLog(data);
        } catch (err) {
          console.error("Failed to parse log event:", err);
        }
      });

      // Handle heartbeat
      eventSource.addEventListener("heartbeat", () => {
        // Connection is alive
      });

      eventSource.onerror = () => {
        setIsConnected(false);
        eventSourceRef.current?.close();
        eventSourceRef.current = null;

        // Attempt reconnection with exponential backoff
        if (reconnectAttempts < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
          reconnectTimeoutRef.current = window.setTimeout(() => {
            setReconnectAttempts((prev) => prev + 1);
            connect();
          }, delay);
        } else {
          onError?.("Log SSE connection failed after max retries");
        }
      };
    } catch (err) {
      console.error("Failed to create EventSource:", err);
      onError?.("Failed to establish log SSE connection");
    }
  }, [reconnectAttempts, addLog, onError]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const pause = useCallback(() => {
    setIsPaused(true);
  }, []);

  const resume = useCallback(() => {
    setIsPaused(false);
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const filterLogs = useCallback(
    (services?: string[], levels?: LogLevel[]): LogEntry[] => {
      return logs.filter((log) => {
        const serviceMatch =
          !services || services.length === 0 || services.includes(log.service);
        const levelMatch =
          !levels || levels.length === 0 || levels.includes(log.level);
        return serviceMatch && levelMatch;
      });
    },
    [logs],
  );

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    isConnected,
    isPaused,
    logs,
    reconnectAttempts,
    connect,
    disconnect,
    pause,
    resume,
    clearLogs,
    filterLogs,
  };
}
