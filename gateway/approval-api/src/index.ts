import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { config } from "./config";
import { logger } from "./services/logger";
import { db } from "./services/database";
import { consumer } from "./services/consumer";
import { discoveryRoutes } from "./routes/discoveries";
import { auditRoutes } from "./routes/audit";
import authRoutes from "./routes/auth";
import usersRoutes from "./routes/users";
import profilesRoutes from "./routes/profiles";
import dryrunRoutes from "./routes/dryrun";
import dashboardRoutes from "./routes/dashboard";
import auditTrailRoutes from "./routes/auditTrail";
import { runMigrations } from "./db/migrate";
import {
  startCleanupScheduler,
  stopCleanupScheduler,
} from "./services/dryrunCleanup";

const app = express();

// Middleware
app.use(
  cors({
    origin: config.cors.origin,
    credentials: true, // Required for httpOnly cookies
  }),
);
app.use(express.json());
app.use(cookieParser());

// Health endpoints
app.get("/health", (req, res) => {
  res.json({ status: "healthy", service: "approval-api" });
});

app.get("/ready", async (req, res) => {
  const dbHealthy = await db.isHealthy();
  const mqHealthy = consumer.isConnected();

  res.json({
    status: dbHealthy && mqHealthy ? "ready" : "degraded",
    service: "approval-api",
    database: dbHealthy ? "connected" : "disconnected",
    rabbitmq: mqHealthy ? "connected" : "disconnected",
  });
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/profiles", profilesRoutes);
app.use("/api/dryrun", dryrunRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/audit-trail", auditTrailRoutes);
app.use("/api/discoveries", discoveryRoutes);
app.use("/api/audit", auditRoutes);

// Error handler
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    logger.error("Unhandled error", { error: err.message, stack: err.stack });
    res.status(500).json({ error: "Internal server error" });
  },
);

// Startup
async function start() {
  try {
    // Initialize database
    await db.connect();
    logger.info("Database connected");

    // Run migrations (includes RBAC tables)
    await runMigrations();
    logger.info("Database migrations complete");

    // Start RabbitMQ consumer
    await consumer.start();
    logger.info("RabbitMQ consumer started");

    // Start HTTP server
    app.listen(config.server.port, config.server.host, () => {
      logger.info(
        `Approval API listening on ${config.server.host}:${config.server.port}`,
      );
    });

    // Start dry-run cleanup scheduler
    startCleanupScheduler();
    logger.info("Dry-run cleanup scheduler started");
  } catch (error) {
    logger.error("Failed to start server", { error });
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("Received SIGTERM, shutting down gracefully");
  stopCleanupScheduler();
  await consumer.stop();
  await db.disconnect();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("Received SIGINT, shutting down gracefully");
  stopCleanupScheduler();
  await consumer.stop();
  await db.disconnect();
  process.exit(0);
});

start();
