import express from "express";
import cors from "cors";
import { config } from "./config";
import { logger } from "./services/logger";
import { db } from "./services/database";
import { consumer } from "./services/consumer";
import { discoveryRoutes } from "./routes/discoveries";
import { auditRoutes } from "./routes/audit";

const app = express();

// Middleware
app.use(cors({ origin: config.cors.origin }));
app.use(express.json());

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
app.use("/api/discoveries", discoveryRoutes);
app.use("/api/audit", auditRoutes);

// Error handler
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    logger.error("Unhandled error", { error: err.message, stack: err.stack });
    res.status(500).json({ error: "Internal server error" });
  }
);

// Startup
async function start() {
  try {
    // Initialize database
    await db.connect();
    logger.info("Database connected");

    // Run migrations
    await db.migrate();
    logger.info("Database migrations complete");

    // Start RabbitMQ consumer
    await consumer.start();
    logger.info("RabbitMQ consumer started");

    // Start HTTP server
    app.listen(config.server.port, config.server.host, () => {
      logger.info(
        `Approval API listening on ${config.server.host}:${config.server.port}`
      );
    });
  } catch (error) {
    logger.error("Failed to start server", { error });
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("Received SIGTERM, shutting down gracefully");
  await consumer.stop();
  await db.disconnect();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("Received SIGINT, shutting down gracefully");
  await consumer.stop();
  await db.disconnect();
  process.exit(0);
});

start();
