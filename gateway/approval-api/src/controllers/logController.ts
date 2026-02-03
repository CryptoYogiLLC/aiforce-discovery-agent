/**
 * Log Controller for SSE log streaming
 * Reference: GitHub Issue #77
 */

import { Request, Response } from "express";
import { logEvents, LogEvent } from "../services/logEvents";
import { logger } from "../services/logger";

const HEARTBEAT_INTERVAL = 15000; // 15 seconds

/**
 * SSE endpoint for log streaming
 * GET /api/logs/stream
 */
export async function streamLogs(req: Request, res: Response): Promise<void> {
  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering

  // Flush headers
  res.flushHeaders();

  logger.info("Log SSE client connected", {
    ip: req.ip,
    userAgent: req.get("User-Agent"),
  });

  // Send initial connected event
  res.write(
    `event: connected\ndata: ${JSON.stringify({
      timestamp: new Date().toISOString(),
    })}\n\n`,
  );

  // Send recent logs from buffer
  const recentLogs = logEvents.getRecentLogs(50);
  for (const log of recentLogs) {
    res.write(`event: log\ndata: ${JSON.stringify(log)}\n\n`);
  }

  // Subscribe to new log events
  const unsubscribe = logEvents.subscribe((event: LogEvent) => {
    try {
      if (event.type === "log") {
        res.write(`event: log\ndata: ${JSON.stringify(event.data)}\n\n`);
      }
    } catch (err) {
      logger.error("Error writing log SSE event", { error: err });
    }
  });

  // Heartbeat to keep connection alive
  const heartbeatInterval = setInterval(() => {
    try {
      res.write(
        `event: heartbeat\ndata: ${JSON.stringify({
          timestamp: new Date().toISOString(),
        })}\n\n`,
      );
    } catch (err) {
      logger.error("Error writing heartbeat", { error: err });
      clearInterval(heartbeatInterval);
    }
  }, HEARTBEAT_INTERVAL);

  // Handle client disconnect
  req.on("close", () => {
    logger.info("Log SSE client disconnected");
    unsubscribe();
    clearInterval(heartbeatInterval);
  });

  // Handle errors
  req.on("error", (err) => {
    logger.error("Log SSE connection error", { error: err.message });
    unsubscribe();
    clearInterval(heartbeatInterval);
  });
}

/**
 * Get recent logs (non-SSE endpoint)
 * GET /api/logs/recent
 */
export async function getRecentLogs(
  req: Request,
  res: Response,
): Promise<void> {
  const count = parseInt(req.query.count as string, 10) || 50;
  const logs = logEvents.getRecentLogs(Math.min(count, 100));
  res.json({ logs, count: logs.length });
}
