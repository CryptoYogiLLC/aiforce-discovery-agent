/**
 * Scan Events service for real-time SSE updates
 * Reference: ADR-007 Discovery Acquisition Model, GitHub Issue #112
 *
 * MVP Implementation: In-process EventEmitter with 15s heartbeat.
 * Future Phase D.2: Migrate to Redis pub/sub for multi-instance scaling.
 */

import { EventEmitter } from "events";
import { logger } from "./logger";

// Event types for scan progress
export interface ScanProgressEvent {
  scan_id: string;
  collector?: string;
  phase?: string;
  progress: number;
  discovery_count: number;
  message?: string;
  timestamp: string;
}

export interface ScanStatusEvent {
  scan_id: string;
  status: string;
  error_message?: string;
  timestamp: string;
}

export interface CollectorStatusEvent {
  scan_id: string;
  collector: string;
  status: string;
  progress: number;
  discovery_count: number;
  error_message?: string;
  timestamp: string;
}

// SSE event types
export type ScanEventType =
  | "progress"
  | "status"
  | "collector"
  | "complete"
  | "error";

export interface ScanEvent {
  type: ScanEventType;
  data: ScanProgressEvent | ScanStatusEvent | CollectorStatusEvent;
}

/**
 * Scan event emitter for SSE broadcasting
 * Uses Node.js EventEmitter (single-process) for MVP
 */
class ScanEventEmitter extends EventEmitter {
  constructor() {
    super();
    // Increase max listeners for many concurrent SSE connections
    this.setMaxListeners(100);
  }

  /**
   * Emit a progress update for a scan
   */
  emitProgress(scanId: string, data: ScanProgressEvent): void {
    const event: ScanEvent = { type: "progress", data };
    this.emit(`scan:${scanId}`, event);
    logger.debug("Scan progress emitted", { scanId, progress: data.progress });
  }

  /**
   * Emit a status change for a scan
   */
  emitStatus(scanId: string, data: ScanStatusEvent): void {
    const event: ScanEvent = { type: "status", data };
    this.emit(`scan:${scanId}`, event);
    logger.debug("Scan status emitted", { scanId, status: data.status });
  }

  /**
   * Emit a collector status update
   */
  emitCollectorStatus(scanId: string, data: CollectorStatusEvent): void {
    const event: ScanEvent = { type: "collector", data };
    this.emit(`scan:${scanId}`, event);
    logger.debug("Collector status emitted", {
      scanId,
      collector: data.collector,
      status: data.status,
    });
  }

  /**
   * Emit scan completion
   */
  emitComplete(scanId: string, status: string): void {
    const event: ScanEvent = {
      type: "complete",
      data: {
        scan_id: scanId,
        status,
        timestamp: new Date().toISOString(),
      } as ScanStatusEvent,
    };
    this.emit(`scan:${scanId}`, event);
    logger.info("Scan complete emitted", { scanId, status });
  }

  /**
   * Emit an error for a scan
   */
  emitError(scanId: string, error: string): void {
    const event: ScanEvent = {
      type: "error",
      data: {
        scan_id: scanId,
        status: "error",
        error_message: error,
        timestamp: new Date().toISOString(),
      } as ScanStatusEvent,
    };
    this.emit(`scan:${scanId}`, event);
    logger.error("Scan error emitted", { scanId, error });
  }

  /**
   * Subscribe to events for a specific scan
   * Returns unsubscribe function
   */
  subscribe(scanId: string, handler: (event: ScanEvent) => void): () => void {
    const eventName = `scan:${scanId}`;
    this.on(eventName, handler);
    logger.debug("SSE subscriber added", { scanId });

    // Return unsubscribe function
    return () => {
      this.off(eventName, handler);
      logger.debug("SSE subscriber removed", { scanId });
    };
  }

  /**
   * Get subscriber count for a scan
   */
  getSubscriberCount(scanId: string): number {
    return this.listenerCount(`scan:${scanId}`);
  }
}

// Singleton instance
export const scanEvents = new ScanEventEmitter();
