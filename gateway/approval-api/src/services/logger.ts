import winston from "winston";
import Transport from "winston-transport";
import { config } from "../config";
import { logEvents, LogLevel } from "./logEvents";

/**
 * Custom winston transport that forwards log entries to the SSE log stream.
 * This bridges the gap between the winston logger and the real-time log UI.
 */
class SSELogTransport extends Transport {
  private readonly serviceName: string;

  constructor(opts?: Transport.TransportStreamOptions & { service?: string }) {
    super(opts);
    this.serviceName = opts?.service || "approval-api";
  }

  log(
    info: {
      level: string;
      message: string;
      timestamp?: string;
      [key: string]: unknown;
    },
    callback: () => void,
  ): void {
    setImmediate(() => {
      // Map winston levels to our LogLevel type
      const levelMap: Record<string, LogLevel> = {
        error: "ERROR",
        warn: "WARN",
        info: "INFO",
        http: "INFO",
        verbose: "DEBUG",
        debug: "DEBUG",
        silly: "DEBUG",
      };

      const level = levelMap[info.level] || "INFO";
      const service = (info.service as string) || this.serviceName;

      // Extract metadata (everything except standard winston fields)
      const metadata = Object.fromEntries(
        Object.entries(info).filter(
          ([k]) => !["level", "message", "timestamp", "service"].includes(k),
        ),
      );
      const cleanMetadata =
        Object.keys(metadata).length > 0 ? metadata : undefined;

      logEvents.emitLog(
        level,
        service,
        String(info.message),
        cleanMetadata as Record<string, unknown> | undefined,
      );
    });

    callback();
  }
}

export const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  defaultMeta: { service: "approval-api" },
  transports: [
    new winston.transports.Console(),
    new SSELogTransport({ service: "approval-api" }),
  ],
});
