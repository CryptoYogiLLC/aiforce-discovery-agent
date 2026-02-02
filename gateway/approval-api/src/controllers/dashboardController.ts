/**
 * Dashboard controller for services monitoring
 * Reference: GitHub Issue #58
 */

import { Request, Response } from "express";
import { param, validationResult } from "express-validator";
import {
  getDashboardOverview,
  getServiceHealthStatus,
  getServicesList,
  getRabbitMQMetrics,
} from "../services/dashboardService";
import { logger } from "../services/logger";

/**
 * GET /api/dashboard
 * Get complete dashboard overview with all services
 */
export async function getDashboardHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const overview = await getDashboardOverview();
    res.json(overview);
  } catch (err) {
    logger.error("Failed to get dashboard overview", {
      error: (err as Error).message,
    });
    res.status(500).json({ error: "Failed to get dashboard overview" });
  }
}

/**
 * GET /api/dashboard/services
 * Get list of all registered services
 */
export async function getServicesListHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const services = getServicesList();
    res.json({ services });
  } catch (err) {
    logger.error("Failed to get services list", {
      error: (err as Error).message,
    });
    res.status(500).json({ error: "Failed to get services list" });
  }
}

/**
 * GET /api/dashboard/services/:name
 * Get health status for a specific service
 */
export const getServiceHealthValidation = [
  param("name").isString().notEmpty().withMessage("Service name is required"),
];

export async function getServiceHealthHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    const health = await getServiceHealthStatus(req.params.name);

    if (!health) {
      res.status(404).json({ error: "Service not found" });
      return;
    }

    res.json({ health });
  } catch (err) {
    logger.error("Failed to get service health", {
      error: (err as Error).message,
      service: req.params.name,
    });
    res.status(500).json({ error: "Failed to get service health" });
  }
}

/**
 * GET /api/dashboard/rabbitmq
 * Get RabbitMQ queue and connection metrics
 */
export async function getRabbitMQHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const metrics = await getRabbitMQMetrics();
    res.json(metrics);
  } catch (err) {
    logger.error("Failed to get RabbitMQ metrics", {
      error: (err as Error).message,
    });
    res.status(500).json({ error: "Failed to get RabbitMQ metrics" });
  }
}

/**
 * GET /api/dashboard/events
 * Get event throughput metrics
 */
export async function getEventMetricsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    // Get overview and extract just event metrics
    const overview = await getDashboardOverview();
    res.json({ events: overview.events });
  } catch (err) {
    logger.error("Failed to get event metrics", {
      error: (err as Error).message,
    });
    res.status(500).json({ error: "Failed to get event metrics" });
  }
}
