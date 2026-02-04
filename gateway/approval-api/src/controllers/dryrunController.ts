/**
 * Dry-Run Session controller
 * Reference: ADR-004 Dry-Run Orchestration Model, ADR-006 Data Partitioning, GitHub Issue #57
 */

import { Request, Response } from "express";
import { body, param, query, validationResult } from "express-validator";
import {
  createSession,
  startSession,
  getSessionById,
  getSessionSummary,
  listSessions,
  stopSession,
  getSessionDiscoveries,
  getDiscoveryById,
  reviewDiscovery,
  getSessionContainers,
  exportSessionResults,
  hasActiveSession,
  addDiscovery,
  registerContainer,
  markSessionCompleted,
} from "../services/dryrunService";
import { getProfileById } from "../services/profileService";
import { logger } from "../services/logger";
import { DryrunSessionStatus } from "../models/dryrun";

/**
 * POST /api/dryrun/sessions
 * Start a new dry-run session
 */
export const createSessionValidation = [
  body("profile_id").isUUID().withMessage("Valid profile ID is required"),
];

export async function createSessionHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const { profile_id } = req.body;

  try {
    // Verify profile exists
    const profile = await getProfileById(profile_id);
    if (!profile) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }

    // Check for existing active session
    if (await hasActiveSession()) {
      res.status(409).json({
        error:
          "A dry-run session is already active. Stop it before starting a new one.",
      });
      return;
    }

    // Create and start session
    const session = await createSession(profile_id, req.user.id);

    res.status(201).json({
      session,
      message:
        "Dry-run session created. Use POST /api/dryrun/sessions/:id/start to begin.",
    });
  } catch (err) {
    logger.error("Failed to create dry-run session", {
      error: (err as Error).message,
    });
    res.status(500).json({ error: "Failed to create dry-run session" });
  }
}

/**
 * POST /api/dryrun/sessions/:id/start
 * Start the dry-run (trigger container generation)
 */
export const startSessionValidation = [
  param("id").isUUID().withMessage("Valid session ID is required"),
];

export async function startSessionHandler(
  req: Request,
  res: Response,
): Promise<void> {
  logger.info("Start session request received", {
    sessionId: req.params.id,
    method: req.method,
    path: req.path,
  });

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn("Start session validation failed", { errors: errors.array() });
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    const session = await getSessionById(req.params.id);
    logger.info("Session retrieved", {
      sessionId: req.params.id,
      status: session?.status,
    });
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    if (session.status !== "pending") {
      res.status(400).json({
        error: `Cannot start session in status: ${session.status}`,
      });
      return;
    }

    const updated = await startSession(req.params.id);

    res.json({
      session: updated,
      message:
        "Dry-run started. Collectors are now running against the test environment.",
    });
  } catch (err) {
    logger.error("Failed to start dry-run session", {
      error: (err as Error).message,
    });
    res.status(500).json({ error: "Failed to start dry-run session" });
  }
}

/**
 * GET /api/dryrun/sessions
 * List all dry-run sessions
 */
export const listSessionsValidation = [
  query("status")
    .optional()
    .isIn([
      "pending",
      "generating",
      "running",
      "completed",
      "failed",
      "cleaning_up",
      "cleaned",
    ])
    .withMessage("Invalid status"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be 1-100"),
  query("offset")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Offset must be non-negative"),
];

export async function listSessionsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    const { sessions, total } = await listSessions({
      status: req.query.status as DryrunSessionStatus | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset
        ? parseInt(req.query.offset as string)
        : undefined,
    });

    res.json({ sessions, total });
  } catch (err) {
    logger.error("Failed to list dry-run sessions", {
      error: (err as Error).message,
    });
    res.status(500).json({ error: "Failed to list sessions" });
  }
}

/**
 * GET /api/dryrun/sessions/:id
 * Get session details
 */
export const getSessionValidation = [
  param("id").isUUID().withMessage("Valid session ID is required"),
];

export async function getSessionHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    const session = await getSessionSummary(req.params.id);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    res.json({ session });
  } catch (err) {
    logger.error("Failed to get dry-run session", {
      error: (err as Error).message,
    });
    res.status(500).json({ error: "Failed to get session" });
  }
}

/**
 * POST /api/dryrun/sessions/:id/stop
 * Stop and cleanup a session
 */
export const stopSessionValidation = [
  param("id").isUUID().withMessage("Valid session ID is required"),
];

export async function stopSessionHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    const session = await stopSession(req.params.id);

    res.json({
      session,
      message: "Dry-run session stopped and test environment cleaned up.",
    });
  } catch (err) {
    const errorMessage = (err as Error).message;

    // Return appropriate HTTP status based on error type
    if (errorMessage === "Session not found") {
      res.status(404).json({ error: errorMessage });
    } else if (errorMessage.startsWith("Cannot stop session")) {
      res.status(400).json({ error: errorMessage });
    } else {
      logger.error("Failed to stop dry-run session", { error: errorMessage });
      res.status(500).json({ error: "Failed to stop dry-run session" });
    }
  }
}

/**
 * GET /api/dryrun/sessions/:id/discoveries
 * Get discoveries for a session
 */
export const getDiscoveriesValidation = [
  param("id").isUUID().withMessage("Valid session ID is required"),
  query("source")
    .optional()
    .isIn(["network-scanner", "code-analyzer", "db-inspector"])
    .withMessage("Invalid source"),
  query("status")
    .optional()
    .isIn(["pending", "approved", "rejected"])
    .withMessage("Invalid status"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 500 })
    .withMessage("Limit must be 1-500"),
  query("offset")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Offset must be non-negative"),
];

export async function getDiscoveriesHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    const session = await getSessionById(req.params.id);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const { discoveries, total } = await getSessionDiscoveries(req.params.id, {
      source: req.query.source as string | undefined,
      status: req.query.status as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset
        ? parseInt(req.query.offset as string)
        : undefined,
    });

    res.json({ discoveries, total, is_dryrun: true });
  } catch (err) {
    logger.error("Failed to get dry-run discoveries", {
      error: (err as Error).message,
    });
    res.status(500).json({ error: "Failed to get discoveries" });
  }
}

/**
 * POST /api/dryrun/discoveries/:id/review
 * Review (approve/reject) a discovery
 */
export const reviewDiscoveryValidation = [
  param("id").isUUID().withMessage("Valid discovery ID is required"),
  body("status")
    .isIn(["approved", "rejected"])
    .withMessage("Status must be 'approved' or 'rejected'"),
  body("notes")
    .optional()
    .isString()
    .isLength({ max: 500 })
    .withMessage("Notes must be at most 500 characters"),
];

export async function reviewDiscoveryHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const discovery = await getDiscoveryById(req.params.id);
    if (!discovery) {
      res.status(404).json({ error: "Discovery not found" });
      return;
    }

    const updated = await reviewDiscovery(
      req.params.id,
      req.body.status,
      req.user.id,
      req.body.notes,
    );

    res.json({ discovery: updated });
  } catch (err) {
    logger.error("Failed to review dry-run discovery", {
      error: (err as Error).message,
    });
    res.status(500).json({ error: "Failed to review discovery" });
  }
}

/**
 * GET /api/dryrun/sessions/:id/containers
 * Get containers for a session
 */
export const getContainersValidation = [
  param("id").isUUID().withMessage("Valid session ID is required"),
];

export async function getContainersHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    const session = await getSessionById(req.params.id);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const containers = await getSessionContainers(req.params.id);

    res.json({ containers });
  } catch (err) {
    logger.error("Failed to get dry-run containers", {
      error: (err as Error).message,
    });
    res.status(500).json({ error: "Failed to get containers" });
  }
}

/**
 * GET /api/dryrun/sessions/:id/export
 * Export session results as JSON
 */
export const exportSessionValidation = [
  param("id").isUUID().withMessage("Valid session ID is required"),
];

export async function exportSessionHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    const session = await getSessionById(req.params.id);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const exportData = await exportSessionResults(req.params.id);

    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="dryrun-${req.params.id}.json"`,
    );
    res.json(exportData);
  } catch (err) {
    logger.error("Failed to export dry-run session", {
      error: (err as Error).message,
    });
    res.status(500).json({ error: "Failed to export session" });
  }
}

/**
 * Internal endpoints for orchestrator callbacks
 */

/**
 * POST /api/dryrun/internal/discoveries
 * Add discovery (called by orchestrator/collectors)
 */
export const addDiscoveryValidation = [
  body("session_id").isUUID().withMessage("Valid session ID is required"),
  body("source")
    .isIn(["network-scanner", "code-analyzer", "db-inspector"])
    .withMessage("Invalid source"),
  body("discovery_type").isString().notEmpty().withMessage("Type is required"),
  body("data").isObject().withMessage("Data must be an object"),
];

export async function addDiscoveryHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    // Validate session exists and is in valid state for adding discoveries
    const session = await getSessionById(req.body.session_id);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    if (!["generating", "running"].includes(session.status)) {
      res.status(400).json({
        error: `Cannot add discovery when session status is ${session.status}`,
      });
      return;
    }

    const discovery = await addDiscovery(
      req.body.session_id,
      req.body.source,
      req.body.discovery_type,
      req.body.data,
    );

    res.status(201).json({ discovery });
  } catch (err) {
    logger.error("Failed to add dry-run discovery", {
      error: (err as Error).message,
    });
    res.status(500).json({ error: "Failed to add discovery" });
  }
}

/**
 * POST /api/dryrun/internal/containers
 * Register container (called by orchestrator)
 */
export const registerContainerValidation = [
  body("session_id").isUUID().withMessage("Valid session ID is required"),
  body("container_id")
    .isString()
    .notEmpty()
    .withMessage("Container ID is required"),
  body("container_name")
    .isString()
    .notEmpty()
    .withMessage("Container name is required"),
  body("service_type")
    .isString()
    .notEmpty()
    .withMessage("Service type is required"),
  body("image").isString().notEmpty().withMessage("Image is required"),
  body("port_mappings").isArray().withMessage("Port mappings must be an array"),
];

export async function registerContainerHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    // Verify session exists before registering container
    const session = await getSessionById(req.body.session_id);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const container = await registerContainer(
      req.body.session_id,
      req.body.container_id,
      req.body.container_name,
      req.body.service_type,
      req.body.image,
      req.body.port_mappings,
    );

    res.status(201).json({ container });
  } catch (err) {
    logger.error("Failed to register dry-run container", {
      error: (err as Error).message,
    });
    res.status(500).json({ error: "Failed to register container" });
  }
}

/**
 * POST /api/dryrun/internal/sessions/:id/complete
 * Mark session as completed (called by orchestrator)
 */
export const completeSessionValidation = [
  param("id").isUUID().withMessage("Valid session ID is required"),
];

export async function completeSessionHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    await markSessionCompleted(req.params.id);
    res.json({ message: "Session marked as completed" });
  } catch (err) {
    logger.error("Failed to complete dry-run session", {
      error: (err as Error).message,
    });
    res.status(500).json({ error: "Failed to complete session" });
  }
}

/**
 * Cleanup management endpoints
 */

import { getCleanupStatus, forceCleanupCycle } from "../services/dryrunCleanup";

/**
 * GET /api/dryrun/cleanup/status
 * Get cleanup scheduler status (admin only)
 */
export async function getCleanupStatusHandler(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    const status = getCleanupStatus();
    res.json(status);
  } catch (err) {
    logger.error("Failed to get cleanup status", {
      error: (err as Error).message,
    });
    res.status(500).json({ error: "Failed to get cleanup status" });
  }
}

/**
 * POST /api/dryrun/cleanup/force
 * Force a cleanup cycle (admin only)
 */
export async function forceCleanupHandler(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    logger.info("Forcing cleanup cycle");
    const result = await forceCleanupCycle();
    res.json({
      message: "Cleanup cycle completed",
      ...result,
    });
  } catch (err) {
    logger.error("Failed to force cleanup cycle", {
      error: (err as Error).message,
    });
    res.status(500).json({ error: "Failed to force cleanup cycle" });
  }
}
