/**
 * Dashboard routes for services monitoring
 * Reference: GitHub Issue #58
 */

import { Router } from "express";
import {
  getDashboardHandler,
  getServicesListHandler,
  getServiceHealthHandler,
  getServiceHealthValidation,
  getRabbitMQHandler,
  getEventMetricsHandler,
} from "../controllers/dashboardController";
import { authenticate } from "../middleware/auth";

const router = Router();

/**
 * All dashboard routes require authentication (viewer+ can access)
 */

// GET /api/dashboard - Get complete dashboard overview
router.get("/", authenticate, getDashboardHandler);

// GET /api/dashboard/services - List all registered services
router.get("/services", authenticate, getServicesListHandler);

// GET /api/dashboard/services/:name - Get specific service health
router.get(
  "/services/:name",
  authenticate,
  getServiceHealthValidation,
  getServiceHealthHandler,
);

// GET /api/dashboard/rabbitmq - Get RabbitMQ metrics
router.get("/rabbitmq", authenticate, getRabbitMQHandler);

// GET /api/dashboard/events - Get event throughput metrics
router.get("/events", authenticate, getEventMetricsHandler);

export default router;
