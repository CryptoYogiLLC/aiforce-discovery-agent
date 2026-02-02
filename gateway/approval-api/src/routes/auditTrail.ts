/**
 * Audit Trail and Transmission History routes
 * Reference: GitHub Issue #59
 */

import { Router } from "express";
import {
  listTransmissionsHandler,
  listTransmissionsValidation,
  getBatchHandler,
  getBatchValidation,
  getBatchItemsHandler,
  getBatchItemsValidation,
  getItemPayloadHandler,
  getItemPayloadValidation,
  verifyItemHandler,
  verifyItemValidation,
  queryLogsHandler,
  queryLogsValidation,
  exportHandler,
  exportValidation,
} from "../controllers/auditTrailController";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();

/**
 * All audit trail routes require authentication
 */

// GET /api/audit-trail/transmissions - List batches (viewer+)
router.get(
  "/transmissions",
  authenticate,
  listTransmissionsValidation,
  listTransmissionsHandler,
);

// GET /api/audit-trail/transmissions/:id - Get batch details (viewer+)
router.get(
  "/transmissions/:id",
  authenticate,
  getBatchValidation,
  getBatchHandler,
);

// GET /api/audit-trail/transmissions/:id/items - Get batch items (viewer+)
router.get(
  "/transmissions/:id/items",
  authenticate,
  getBatchItemsValidation,
  getBatchItemsHandler,
);

// GET /api/audit-trail/items/:id/payload - Get full payload (admin only)
router.get(
  "/items/:id/payload",
  authenticate,
  requireRole("admin"),
  getItemPayloadValidation,
  getItemPayloadHandler,
);

// GET /api/audit-trail/items/:id/verify - Verify integrity (viewer+)
router.get(
  "/items/:id/verify",
  authenticate,
  verifyItemValidation,
  verifyItemHandler,
);

// GET /api/audit-trail/logs - Query audit log (viewer+)
router.get("/logs", authenticate, queryLogsValidation, queryLogsHandler);

// GET /api/audit-trail/export - Generate compliance export (admin only)
router.get(
  "/export",
  authenticate,
  requireRole("admin"),
  exportValidation,
  exportHandler,
);

export default router;
