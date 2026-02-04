/**
 * Log Events service for real-time SSE log streaming
 * Reference: GitHub Issue #77
 *
 * MVP Implementation: In-process EventEmitter with 15s heartbeat.
 */

import { EventEmitter } from "events";

// Log level types
export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

// Log entry interface
export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  metadata?: Record<string, unknown>;
}

// SSE log event
export interface LogEvent {
  type: "log" | "heartbeat";
  data: LogEntry | { timestamp: string };
}

/**
 * Log event emitter for SSE broadcasting
 * Uses Node.js EventEmitter (single-process) for MVP
 */
class LogEventEmitter extends EventEmitter {
  private logBuffer: LogEntry[] = [];
  private readonly maxBufferSize = 100;
  private logIdCounter = 0;

  constructor() {
    super();
    // Increase max listeners for many concurrent SSE connections
    this.setMaxListeners(100);
  }

  /**
   * Generate a unique log ID
   */
  private generateLogId(): string {
    this.logIdCounter += 1;
    return `log-${Date.now()}-${this.logIdCounter}`;
  }

  /**
   * Emit a log entry to all subscribers
   */
  emitLog(
    level: LogLevel,
    service: string,
    message: string,
    metadata?: Record<string, unknown>,
  ): void {
    const entry: LogEntry = {
      id: this.generateLogId(),
      timestamp: new Date().toISOString(),
      level,
      service,
      message,
      metadata,
    };

    // Add to buffer (for recent logs on connect)
    this.logBuffer.push(entry);
    if (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer.shift();
    }

    // Emit to all subscribers
    const event: LogEvent = { type: "log", data: entry };
    this.emit("log", event);

    // Debug logging intentionally uses console to avoid circular dependency with logger
  }

  /**
   * Get recent logs from buffer
   */
  getRecentLogs(count: number = 50): LogEntry[] {
    return this.logBuffer.slice(-count);
  }

  /**
   * Subscribe to log events
   * Returns unsubscribe function
   */
  subscribe(handler: (event: LogEvent) => void): () => void {
    this.on("log", handler);
    // Subscriber tracking (no logger to avoid circular dependency)

    // Return unsubscribe function
    return () => {
      this.off("log", handler);
      // Subscriber removed (no logger to avoid circular dependency)
    };
  }

  /**
   * Get subscriber count
   */
  getSubscriberCount(): number {
    return this.listenerCount("log");
  }

  /**
   * Clear log buffer
   */
  clearBuffer(): void {
    this.logBuffer = [];
  }
}

// Singleton instance
export const logEvents = new LogEventEmitter();

/**
 * Helper to emit logs from various services
 * This can be called from anywhere in the codebase
 */
export function emitServiceLog(
  service: string,
  level: LogLevel,
  message: string,
  metadata?: Record<string, unknown>,
): void {
  logEvents.emitLog(level, service, message, metadata);
}
