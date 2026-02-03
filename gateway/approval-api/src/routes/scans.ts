/**
 * Scan Run routes for autonomous discovery orchestration
 * Reference: ADR-007 Discovery Acquisition Model, GitHub Issue #108
 */

import { Router } from "express";
import {
  createScanHandler,
  createScanValidation,
  startScanHandler,
  startScanValidation,
  stopScanHandler,
  stopScanValidation,
  listScansHandler,
  listScansValidation,
  getScanHandler,
  getScanValidation,
  getScanDiscoveriesHandler,
  getScanDiscoveriesValidation,
  getScanEventsHandler,
  getScanEventsValidation,
  triggerInspectionHandler,
  triggerInspectionValidation,
  progressCallbackHandler,
  progressCallbackValidation,
  completeCallbackHandler,
  completeCallbackValidation,
} from "../controllers/scanController";
import {
  authenticate,
  validateCsrf,
  requireRole,
  internalApiKeyAuthRequired,
} from "../middleware/auth";

const router = Router();

// === Public Endpoints (session cookie auth + CSRF for POST) ===

// GET /api/scans - List all scans (viewer+)
router.get("/", authenticate, listScansValidation, listScansHandler);

// GET /api/scans/:id - Get scan details (viewer+)
router.get("/:id", authenticate, getScanValidation, getScanHandler);

// GET /api/scans/:id/discoveries - Get discoveries for scan (viewer+)
router.get(
  "/:id/discoveries",
  authenticate,
  getScanDiscoveriesValidation,
  getScanDiscoveriesHandler,
);

// GET /api/scans/:id/events - SSE progress stream (viewer+)
// Note: SSE doesn't need CSRF since it's GET
router.get(
  "/:id/events",
  authenticate,
  getScanEventsValidation,
  getScanEventsHandler,
);

// POST /api/scans - Create scan from profile (operator+)
router.post(
  "/",
  authenticate,
  validateCsrf,
  requireRole("operator"),
  createScanValidation,
  createScanHandler,
);

// POST /api/scans/:id/start - Start scanning (operator+) - idempotent
router.post(
  "/:id/start",
  authenticate,
  validateCsrf,
  requireRole("operator"),
  startScanValidation,
  startScanHandler,
);

// POST /api/scans/:id/stop - Stop/cancel scan (operator+)
router.post(
  "/:id/stop",
  authenticate,
  validateCsrf,
  requireRole("operator"),
  stopScanValidation,
  stopScanHandler,
);

// POST /api/scans/:id/inspect - Trigger deep inspection with credentials (operator+)
router.post(
  "/:id/inspect",
  authenticate,
  validateCsrf,
  requireRole("operator"),
  triggerInspectionValidation,
  triggerInspectionHandler,
);

// === Internal Endpoints (API key auth, NO CSRF - machine-to-machine) ===

// POST /api/scans/internal/:id/progress - Collector progress callback
router.post(
  "/internal/:id/progress",
  internalApiKeyAuthRequired,
  progressCallbackValidation,
  progressCallbackHandler,
);

// POST /api/scans/internal/:id/complete - Collector completion callback
router.post(
  "/internal/:id/complete",
  internalApiKeyAuthRequired,
  completeCallbackValidation,
  completeCallbackHandler,
);

export default router;
