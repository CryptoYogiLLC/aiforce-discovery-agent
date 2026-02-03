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
  collector_name: string;
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
  const [isConnected, setIsConnected] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const maxReconnectAttempts = 5;

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
        setReconnectAttempts(0);
      };

      // Handle named events
      eventSource.addEventListener("connected", (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("SSE connected:", data);
        } catch {
          // Ignore parse errors
        }
      });

      eventSource.addEventListener("progress", (event) => {
        try {
          const data: ScanProgressEvent = JSON.parse(event.data);
          onProgress?.(data);
        } catch (err) {
          console.error("Failed to parse progress event:", err);
        }
      });

      eventSource.addEventListener("collector", (event) => {
        try {
          const data: ScanCollectorEvent = JSON.parse(event.data);
          onCollectorUpdate?.(data);
        } catch (err) {
          console.error("Failed to parse collector event:", err);
        }
      });

      eventSource.addEventListener("status", (event) => {
        try {
          const data: ScanStatusEvent = JSON.parse(event.data);
          onStatusUpdate?.(data);

          // Also emit as scan update
          onScanUpdate?.({
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
          onScanUpdate?.(data);
        } catch (err) {
          console.error("Failed to parse scan event:", err);
        }
      });

      // Generic message handler (fallback)
      eventSource.onmessage = (event) => {
        // Handle generic messages if any
        console.log("SSE message:", event.data);
      };

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
          onError?.("SSE connection failed after max retries");
        }
      };
    } catch (err) {
      console.error("Failed to create EventSource:", err);
      onError?.("Failed to establish SSE connection");
    }
  }, [
    scanId,
    reconnectAttempts,
    onProgress,
    onCollectorUpdate,
    onStatusUpdate,
    onScanUpdate,
    onError,
  ]);

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
