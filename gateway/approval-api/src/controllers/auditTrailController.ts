/**
 * Audit Trail and Transmission History controller
 * Reference: GitHub Issue #59
 */

import { Request, Response } from "express";
import { param, query, validationResult } from "express-validator";
import {
  listBatches,
  getBatchById,
  getBatchItems,
  getItemPayload,
  verifyItemIntegrity,
  queryAuditLog,
  generateComplianceExport,
} from "../services/auditTrailService";
import { logger } from "../services/logger";
import { AuditEventType } from "../models/auditTrail";

/**
 * GET /api/audit-trail/transmissions
 * List transmission batches
 */
export const listTransmissionsValidation = [
  query("status")
    .optional()
    .isIn(["pending", "in_progress", "success", "failed", "retrying"])
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

export async function listTransmissionsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    const { batches, total } = await listBatches({
      status: req.query.status as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset
        ? parseInt(req.query.offset as string)
        : undefined,
    });

    res.json({ batches, total });
  } catch (err) {
    logger.error("Failed to list transmissions", {
      error: (err as Error).message,
    });
    res.status(500).json({ error: "Failed to list transmissions" });
  }
}

/**
 * GET /api/audit-trail/transmissions/:id
 * Get transmission batch details
 */
export const getBatchValidation = [
  param("id").isUUID().withMessage("Valid batch ID is required"),
];

export async function getBatchHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    const batch = await getBatchById(req.params.id);
    if (!batch) {
      res.status(404).json({ error: "Batch not found" });
      return;
    }

    res.json({ batch });
  } catch (err) {
    logger.error("Failed to get batch", { error: (err as Error).message });
    res.status(500).json({ error: "Failed to get batch" });
  }
}

/**
 * GET /api/audit-trail/transmissions/:id/items
 * Get items in a batch (summary, no payloads)
 */
export const getBatchItemsValidation = [
  param("id").isUUID().withMessage("Valid batch ID is required"),
];

export async function getBatchItemsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    const batch = await getBatchById(req.params.id);
    if (!batch) {
      res.status(404).json({ error: "Batch not found" });
      return;
    }

    const items = await getBatchItems(req.params.id);
    res.json({ items });
  } catch (err) {
    logger.error("Failed to get batch items", {
      error: (err as Error).message,
    });
    res.status(500).json({ error: "Failed to get batch items" });
  }
}

/**
 * GET /api/audit-trail/items/:id/payload
 * Get full item payload (Admin only)
 */
export const getItemPayloadValidation = [
  param("id").isUUID().withMessage("Valid item ID is required"),
  query("reason")
    .optional()
    .isString()
    .isLength({ max: 500 })
    .withMessage("Reason must be at most 500 characters"),
];

export async function getItemPayloadHandler(
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

  // Admin only
  if (req.user.role !== "admin") {
    res.status(403).json({
      error: "Only administrators can view full payloads",
    });
    return;
  }

  try {
    const item = await getItemPayload(
      req.params.id,
      req.user.id,
      req.ip,
      req.query.reason as string | undefined,
    );

    if (!item) {
      res.status(404).json({ error: "Item not found" });
      return;
    }

    res.json({
      item,
      warning: "This payload access has been logged for compliance purposes.",
    });
  } catch (err) {
    logger.error("Failed to get item payload", {
      error: (err as Error).message,
    });
    res.status(500).json({ error: "Failed to get item payload" });
  }
}

/**
 * GET /api/audit-trail/items/:id/verify
 * Verify item payload integrity
 */
export const verifyItemValidation = [
  param("id").isUUID().withMessage("Valid item ID is required"),
];

export async function verifyItemHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    const result = await verifyItemIntegrity(req.params.id);

    res.json({
      verified: result.valid,
      stored_hash: result.stored_hash,
      computed_hash: result.computed_hash,
      message: result.valid
        ? "Payload integrity verified - hashes match"
        : "WARNING: Payload integrity check failed - hashes do not match",
    });
  } catch (err) {
    if ((err as Error).message === "Item not found") {
      res.status(404).json({ error: "Item not found" });
      return;
    }
    logger.error("Failed to verify item", { error: (err as Error).message });
    res.status(500).json({ error: "Failed to verify item" });
  }
}

/**
 * GET /api/audit-trail/logs
 * Query audit log
 */
export const queryLogsValidation = [
  query("event_type").optional().isString().withMessage("Invalid event type"),
  query("actor_id").optional().isUUID().withMessage("Invalid actor ID"),
  query("target_type").optional().isString().withMessage("Invalid target type"),
  query("target_id").optional().isString().withMessage("Invalid target ID"),
  query("since").optional().isISO8601().withMessage("Invalid since date"),
  query("until").optional().isISO8601().withMessage("Invalid until date"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 500 })
    .withMessage("Limit must be 1-500"),
  query("offset")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Offset must be non-negative"),
];

export async function queryLogsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    const { entries, total } = await queryAuditLog({
      event_type: req.query.event_type as AuditEventType | undefined,
      actor_id: req.query.actor_id as string | undefined,
      target_type: req.query.target_type as string | undefined,
      target_id: req.query.target_id as string | undefined,
      since: req.query.since ? new Date(req.query.since as string) : undefined,
      until: req.query.until ? new Date(req.query.until as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset
        ? parseInt(req.query.offset as string)
        : undefined,
    });

    res.json({ entries, total });
  } catch (err) {
    logger.error("Failed to query audit logs", {
      error: (err as Error).message,
    });
    res.status(500).json({ error: "Failed to query audit logs" });
  }
}

/**
 * GET /api/audit-trail/export
 * Generate compliance export
 */
export const exportValidation = [
  query("since").optional().isISO8601().withMessage("Invalid since date"),
  query("until").optional().isISO8601().withMessage("Invalid until date"),
  query("batch_ids").optional().isString().withMessage("Invalid batch IDs"),
];

export async function exportHandler(
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

  // Admin only
  if (req.user.role !== "admin") {
    res.status(403).json({
      error: "Only administrators can generate compliance exports",
    });
    return;
  }

  try {
    // Sanitize batch_ids: trim whitespace and filter empty strings
    const batchIds = req.query.batch_ids
      ? (req.query.batch_ids as string)
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id.length > 0)
      : undefined;

    const exportData = await generateComplianceExport({
      since: req.query.since ? new Date(req.query.since as string) : undefined,
      until: req.query.until ? new Date(req.query.until as string) : undefined,
      batch_ids: batchIds,
    });

    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="compliance-export-${
        new Date().toISOString().split("T")[0]
      }.json"`,
    );
    res.json(exportData);
  } catch (err) {
    logger.error("Failed to generate export", {
      error: (err as Error).message,
    });
    res.status(500).json({ error: "Failed to generate export" });
  }
}
