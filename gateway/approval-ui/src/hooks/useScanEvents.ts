/**
 * SSE hook for real-time scan progress updates.
 *
 * Reference: ADR-007 Discovery Acquisition Model
 */
import { useEffect, useRef, useCallback, useState } from "react";
import type { ScanRun } from "../types";
import { api } from "../services/api";

export type ScanEventType =
  | "connected"
  | "progress"
  | "collector"
  | "status"
  | "error";

export interface ScanProgressEvent {
  scan_id: string;
  phase: string;
  progress: number;
  discovery_count: number;
  message?: string;
}

export interface ScanCollectorEvent {
  collector: string;
  status: string;
  progress: number;
  discovery_count: number;
}

export interface ScanStatusEvent {
  status: string;
  error_message?: string;
}

interface UseScanEventsOptions {
  scanId: string | null;
  onProgress?: (event: ScanProgressEvent) => void;
  onCollectorUpdate?: (event: ScanCollectorEvent) => void;
  onStatusUpdate?: (event: ScanStatusEvent) => void;
  onScanUpdate?: (scan: Partial<ScanRun>) => void;
  onError?: (error: string) => void;
}

export function useScanEvents({
  scanId,
  onProgress,
  onCollectorUpdate,
  onStatusUpdate,
  onScanUpdate,
  onError,
}: UseScanEventsOptions) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const [isConnected, setIsConnected] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const maxReconnectAttempts = 10;

  // Store callbacks in refs to avoid stale closures and dependency churn
  const callbacksRef = useRef({
    onProgress,
    onCollectorUpdate,
    onStatusUpdate,
    onScanUpdate,
    onError,
  });
  callbacksRef.current = {
    onProgress,
    onCollectorUpdate,
    onStatusUpdate,
    onScanUpdate,
    onError,
  };

  const connect = useCallback(() => {
    if (!scanId) return;

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    try {
      const url = api.scans.getEventsUrl(scanId);
      const eventSource = new EventSource(url, { withCredentials: true });
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
        setReconnectAttempts(0);
      };

      // Handle named events
      eventSource.addEventListener("connected", (event) => {
        try {
          JSON.parse(event.data);
        } catch {
          // Ignore parse errors
        }
      });

      eventSource.addEventListener("progress", (event) => {
        try {
          const data: ScanProgressEvent = JSON.parse(event.data);
          callbacksRef.current.onProgress?.(data);
        } catch (err) {
          console.error("Failed to parse progress event:", err);
        }
      });

      eventSource.addEventListener("collector", (event) => {
        try {
          const data: ScanCollectorEvent = JSON.parse(event.data);
          callbacksRef.current.onCollectorUpdate?.(data);
        } catch (err) {
          console.error("Failed to parse collector event:", err);
        }
      });

      eventSource.addEventListener("status", (event) => {
        try {
          const data: ScanStatusEvent = JSON.parse(event.data);
          callbacksRef.current.onStatusUpdate?.(data);

          // Also emit as scan update
          callbacksRef.current.onScanUpdate?.({
            status: data.status as ScanRun["status"],
            error_message: data.error_message || null,
          });
        } catch (err) {
          console.error("Failed to parse status event:", err);
        }
      });

      eventSource.addEventListener("scan", (event) => {
        try {
          const data: Partial<ScanRun> = JSON.parse(event.data);
          callbacksRef.current.onScanUpdate?.(data);
        } catch (err) {
          console.error("Failed to parse scan event:", err);
        }
      });

      eventSource.onerror = () => {
        setIsConnected(false);
        eventSourceRef.current?.close();
        eventSourceRef.current = null;

        const attempts = reconnectAttemptsRef.current;
        if (attempts < maxReconnectAttempts) {
          // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (capped)
          const delay = Math.min(1000 * Math.pow(2, attempts), 30000);
          reconnectTimeoutRef.current = window.setTimeout(() => {
            reconnectAttemptsRef.current += 1;
            setReconnectAttempts(reconnectAttemptsRef.current);
            connect();
          }, delay);
        } else {
          // Reset and try one more cycle after a longer delay (60s)
          reconnectTimeoutRef.current = window.setTimeout(() => {
            reconnectAttemptsRef.current = 0;
            setReconnectAttempts(0);
            connect();
          }, 60000);
          callbacksRef.current.onError?.(
            "SSE connection unstable, retrying in 60s",
          );
        }
      };
    } catch (err) {
      console.error("Failed to create EventSource:", err);
      callbacksRef.current.onError?.("Failed to establish SSE connection");
    }
  }, [scanId]);

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

  useEffect(() => {
    if (scanId) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [scanId, connect, disconnect]);

  return {
    isConnected,
    reconnectAttempts,
    disconnect,
    reconnect: connect,
  };
}
