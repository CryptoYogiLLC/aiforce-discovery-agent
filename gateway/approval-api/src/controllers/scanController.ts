/**
 * Scan Run controller for autonomous discovery orchestration
 * Reference: ADR-007 Discovery Acquisition Model, GitHub Issue #108
 */

import { Request, Response } from "express";
import { body, param, query, validationResult } from "express-validator";
import {
  createScan,
  startScan,
  stopScan,
  getScanById,
  getScanSummary,
  listScans,
  getScanDiscoveries,
  getScanCollectors,
  triggerInspection,
  skipInspection,
  handleCollectorProgress,
  handleCollectorComplete,
  hasActiveScan,
} from "../services/scanService";
import { scanEvents, ScanEvent } from "../services/scanEvents";
import { getProfileById } from "../services/profileService";
import { logger } from "../services/logger";
import {
  ScanRunStatus,
  CollectorProgressCallback,
  CollectorCompleteCallback,
  InspectionTarget,
} from "../models/scanRun";

// === Public Endpoints (session cookie auth + CSRF) ===

/**
 * POST /api/scans
 * Create a new scan from a profile
 */
export const createScanValidation = [
  body("profile_id").isUUID().withMessage("Valid profile ID is required"),
];

export async function createScanHandler(
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

    // Check for existing active scan
    if (await hasActiveScan(profile_id)) {
      res.status(409).json({
        error:
          "An active scan already exists for this profile. Stop it before starting a new one.",
      });
      return;
    }

    // Create scan
    const scan = await createScan(profile_id, req.user.id);

    res.status(201).json({
      scan,
      message: "Scan created. Use POST /api/scans/:id/start to begin scanning.",
    });
  } catch (err) {
    logger.error("Failed to create scan", { error: (err as Error).message });
    res.status(500).json({ error: "Failed to create scan" });
  }
}

/**
 * POST /api/scans/:id/start
 * Start scanning (idempotent - safe to call multiple times)
 */
export const startScanValidation = [
  param("id").isUUID().withMessage("Valid scan ID is required"),
];

export async function startScanHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    const scan = await getScanById(req.params.id);
    if (!scan) {
      res.status(404).json({ error: "Scan not found" });
      return;
    }

    const updated = await startScan(req.params.id);

    res.json({
      scan: updated,
      message: "Scan started. Collectors are now discovering the environment.",
    });
  } catch (err) {
    logger.error("Failed to start scan", { error: (err as Error).message });
    res.status(500).json({ error: "Failed to start scan" });
  }
}

/**
 * POST /api/scans/:id/stop
 * Stop/cancel a running scan
 */
export const stopScanValidation = [
  param("id").isUUID().withMessage("Valid scan ID is required"),
];

export async function stopScanHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    const scan = await getScanById(req.params.id);
    if (!scan) {
      res.status(404).json({ error: "Scan not found" });
      return;
    }

    const updated = await stopScan(req.params.id);

    res.json({
      scan: updated,
      message: "Scan cancelled.",
    });
  } catch (err) {
    logger.error("Failed to stop scan", { error: (err as Error).message });
    res.status(500).json({ error: "Failed to stop scan" });
  }
}

/**
 * GET /api/scans
 * List all scans with optional filters
 */
export const listScansValidation = [
  query("status")
    .optional()
    .isIn([
      "pending",
      "scanning",
      "awaiting_inspection",
      "inspecting",
      "completed",
      "failed",
      "cancelled",
    ])
    .withMessage("Invalid status filter"),
  query("profile_id").optional().isUUID().withMessage("Invalid profile ID"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be 1-100"),
  query("offset")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Offset must be >= 0"),
];

export async function listScansHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    const filters = {
      status: req.query.status as ScanRunStatus | undefined,
      profile_id: req.query.profile_id as string | undefined,
      started_by: req.query.started_by as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset
        ? parseInt(req.query.offset as string)
        : undefined,
    };

    const result = await listScans(filters);

    res.json({
      scans: result.scans,
      total: result.total,
      limit: filters.limit || 20,
      offset: filters.offset || 0,
    });
  } catch (err) {
    logger.error("Failed to list scans", { error: (err as Error).message });
    res.status(500).json({ error: "Failed to list scans" });
  }
}

/**
 * GET /api/scans/:id
 * Get scan details
 */
export const getScanValidation = [
  param("id").isUUID().withMessage("Valid scan ID is required"),
];

export async function getScanHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    const scan = await getScanSummary(req.params.id);
    if (!scan) {
      res.status(404).json({ error: "Scan not found" });
      return;
    }

    // Get collectors for this scan
    const collectors = await getScanCollectors(req.params.id);

    res.json({ scan, collectors });
  } catch (err) {
    logger.error("Failed to get scan", { error: (err as Error).message });
    res.status(500).json({ error: "Failed to get scan" });
  }
}

/**
 * GET /api/scans/:id/discoveries
 * Get discoveries for a scan
 */
export const getScanDiscoveriesValidation = [
  param("id").isUUID().withMessage("Valid scan ID is required"),
  query("source_service")
    .optional()
    .isString()
    .withMessage("Invalid source service"),
  query("event_type").optional().isString().withMessage("Invalid event type"),
  query("candidate")
    .optional()
    .isBoolean()
    .withMessage("Invalid candidate filter"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 500 })
    .withMessage("Limit must be 1-500"),
  query("offset")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Offset must be >= 0"),
];

export async function getScanDiscoveriesHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    const scan = await getScanById(req.params.id);
    if (!scan) {
      res.status(404).json({ error: "Scan not found" });
      return;
    }

    const filters = {
      source_service: req.query.source_service as string | undefined,
      event_type: req.query.event_type as string | undefined,
      candidate: req.query.candidate === "true" ? true : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset
        ? parseInt(req.query.offset as string)
        : undefined,
    };

    const result = await getScanDiscoveries(req.params.id, filters);

    res.json({
      discoveries: result.discoveries,
      total: result.total,
      limit: filters.limit || 50,
      offset: filters.offset || 0,
    });
  } catch (err) {
    logger.error("Failed to get scan discoveries", {
      error: (err as Error).message,
    });
    res.status(500).json({ error: "Failed to get scan discoveries" });
  }
}

/**
 * GET /api/scans/:id/collectors
 * Get collector status for a scan
 */
export const getScanCollectorsValidation = [
  param("id").isUUID().withMessage("Valid scan ID is required"),
];

export async function getScanCollectorsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    const scan = await getScanById(req.params.id);
    if (!scan) {
      res.status(404).json({ error: "Scan not found" });
      return;
    }

    const collectors = await getScanCollectors(req.params.id);
    res.json({ collectors });
  } catch (err) {
    logger.error("Failed to get scan collectors", {
      error: (err as Error).message,
    });
    res.status(500).json({ error: "Failed to get scan collectors" });
  }
}

/**
 * GET /api/scans/:id/events
 * SSE endpoint for real-time scan progress
 */
export const getScanEventsValidation = [
  param("id").isUUID().withMessage("Valid scan ID is required"),
];

export async function getScanEventsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  const scanId = req.params.id;

  // Verify scan exists
  const scan = await getScanById(scanId);
  if (!scan) {
    res.status(404).json({ error: "Scan not found" });
    return;
  }

  // Set up SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering

  // Send initial connection event
  res.write(`event: connected\n`);
  res.write(
    `data: ${JSON.stringify({ scan_id: scanId, status: scan.status })}\n\n`,
  );

  // Event handler for scan updates
  const handler = (event: ScanEvent) => {
    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify(event.data)}\n\n`);
  };

  // Subscribe to scan events
  const unsubscribe = scanEvents.subscribe(scanId, handler);

  // Heartbeat every 15s to prevent nginx/proxy timeouts
  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`); // SSE comment (ignored by clients)
  }, 15000);

  // Cleanup on client disconnect
  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
    logger.debug("SSE connection closed", { scanId });
  });
}

/**
 * POST /api/scans/:id/inspect
 * Trigger deep inspection with credentials
 */
export const triggerInspectionValidation = [
  param("id").isUUID().withMessage("Valid scan ID is required"),
  body("targets")
    .isArray()
    .withMessage("Targets must be an array (empty to skip inspection)"),
  body("targets.*.host")
    .isString()
    .notEmpty()
    .withMessage("Target host is required"),
  body("targets.*.port")
    .isInt({ min: 1, max: 65535 })
    .withMessage("Valid port is required"),
  body("targets.*.db_type")
    .isString()
    .notEmpty()
    .withMessage("Database type is required"),
  body("targets.*.credentials.username")
    .isString()
    .notEmpty()
    .withMessage("Username is required"),
  body("targets.*.credentials.password")
    .isString()
    .notEmpty()
    .withMessage("Password is required"),
];

export async function triggerInspectionHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    const scan = await getScanById(req.params.id);
    if (!scan) {
      res.status(404).json({ error: "Scan not found" });
      return;
    }

    if (scan.status !== "awaiting_inspection") {
      res.status(400).json({
        error: `Cannot trigger inspection in status: ${scan.status}`,
      });
      return;
    }

    const targets = req.body.targets as InspectionTarget[];

    // Empty targets = skip inspection, complete scan without deep inspection
    if (targets.length === 0) {
      const updated = await skipInspection(req.params.id);
      res.json({
        scan: updated,
        message: "Inspection skipped. Scan completed.",
      });
      return;
    }

    const updated = await triggerInspection(req.params.id, targets);

    res.json({
      scan: updated,
      message: "Inspection started for selected database candidates.",
    });
  } catch (err) {
    logger.error("Failed to trigger inspection", {
      error: (err as Error).message,
    });
    res.status(500).json({ error: "Failed to trigger inspection" });
  }
}

// === Internal Endpoints (API key auth, no CSRF) ===

/**
 * POST /api/scans/internal/:id/progress
 * Collector progress callback
 */
export const progressCallbackValidation = [
  param("id").isUUID().withMessage("Valid scan ID is required"),
  body("scan_id").isUUID().withMessage("Valid scan_id is required"),
  body("collector")
    .isString()
    .notEmpty()
    .withMessage("Collector name is required"),
  body("sequence").isInt({ min: 0 }).withMessage("Valid sequence is required"),
  body("progress")
    .isInt({ min: 0, max: 100 })
    .withMessage("Progress must be 0-100"),
  body("discovery_count")
    .isInt({ min: 0 })
    .withMessage("Valid discovery count is required"),
  body("timestamp")
    .isISO8601()
    .withMessage("Valid ISO 8601 timestamp is required"),
];

export async function progressCallbackHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  // Verify scan_id matches URL param
  if (req.body.scan_id !== req.params.id) {
    res.status(400).json({ error: "scan_id mismatch" });
    return;
  }

  try {
    const callback: CollectorProgressCallback = {
      scan_id: req.body.scan_id,
      collector: req.body.collector,
      sequence: req.body.sequence,
      phase: req.body.phase,
      progress: req.body.progress,
      discovery_count: req.body.discovery_count,
      message: req.body.message,
      timestamp: req.body.timestamp,
    };

    const accepted = await handleCollectorProgress(callback);

    if (!accepted) {
      res.status(204).end();
      return;
    }

    res.status(200).json({
      accepted: true,
      message: "Progress updated",
    });
  } catch (err) {
    logger.error("Failed to process progress callback", {
      error: (err as Error).message,
    });
    res.status(500).json({ error: "Failed to process progress callback" });
  }
}

/**
 * POST /api/scans/internal/:id/complete
 * Collector completion callback
 */
export const completeCallbackValidation = [
  param("id").isUUID().withMessage("Valid scan ID is required"),
  body("scan_id").isUUID().withMessage("Valid scan_id is required"),
  body("collector")
    .isString()
    .notEmpty()
    .withMessage("Collector name is required"),
  body("status")
    .isIn(["completed", "failed", "timeout"])
    .withMessage("Invalid status"),
  body("discovery_count")
    .isInt({ min: 0 })
    .withMessage("Valid discovery count is required"),
  body("timestamp")
    .isISO8601()
    .withMessage("Valid ISO 8601 timestamp is required"),
];

export async function completeCallbackHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  // Verify scan_id matches URL param
  if (req.body.scan_id !== req.params.id) {
    res.status(400).json({ error: "scan_id mismatch" });
    return;
  }

  try {
    const callback: CollectorCompleteCallback = {
      scan_id: req.body.scan_id,
      collector: req.body.collector,
      status: req.body.status,
      discovery_count: req.body.discovery_count,
      error_message: req.body.error_message,
      timestamp: req.body.timestamp,
    };

    const accepted = await handleCollectorComplete(callback);

    res.status(accepted ? 200 : 204).json({
      accepted,
      message: accepted ? "Completion recorded" : "Already completed",
    });
  } catch (err) {
    logger.error("Failed to process complete callback", {
      error: (err as Error).message,
    });
    res.status(500).json({ error: "Failed to process complete callback" });
  }
}
