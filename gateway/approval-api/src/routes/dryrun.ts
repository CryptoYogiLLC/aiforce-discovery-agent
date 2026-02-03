/**
 * Dry-Run Session routes
 * Reference: ADR-004 Dry-Run Orchestration Model, ADR-006 Data Partitioning, GitHub Issue #57
 */

import { Router } from "express";
import {
  createSessionHandler,
  createSessionValidation,
  startSessionHandler,
  startSessionValidation,
  listSessionsHandler,
  listSessionsValidation,
  getSessionHandler,
  getSessionValidation,
  stopSessionHandler,
  stopSessionValidation,
  getDiscoveriesHandler,
  getDiscoveriesValidation,
  reviewDiscoveryHandler,
  reviewDiscoveryValidation,
  getContainersHandler,
  getContainersValidation,
  exportSessionHandler,
  exportSessionValidation,
  addDiscoveryHandler,
  addDiscoveryValidation,
  registerContainerHandler,
  registerContainerValidation,
  completeSessionHandler,
  completeSessionValidation,
  getCleanupStatusHandler,
  forceCleanupHandler,
} from "../controllers/dryrunController";
import {
  authenticate,
  validateCsrf,
  requireRole,
  internalApiKeyAuth,
} from "../middleware/auth";

const router = Router();

/**
 * Public session endpoints (authenticated users)
 */

// GET /api/dryrun/sessions - List all sessions (viewer+)
router.get(
  "/sessions",
  authenticate,
  listSessionsValidation,
  listSessionsHandler,
);

// GET /api/dryrun/sessions/:id - Get session details (viewer+)
router.get(
  "/sessions/:id",
  authenticate,
  getSessionValidation,
  getSessionHandler,
);

// GET /api/dryrun/sessions/:id/discoveries - Get discoveries (viewer+)
router.get(
  "/sessions/:id/discoveries",
  authenticate,
  getDiscoveriesValidation,
  getDiscoveriesHandler,
);

// GET /api/dryrun/sessions/:id/containers - Get containers (viewer+)
router.get(
  "/sessions/:id/containers",
  authenticate,
  getContainersValidation,
  getContainersHandler,
);

// GET /api/dryrun/sessions/:id/export - Export results (viewer+)
router.get(
  "/sessions/:id/export",
  authenticate,
  exportSessionValidation,
  exportSessionHandler,
);

// POST /api/dryrun/sessions - Create new session (operator+)
router.post(
  "/sessions",
  authenticate,
  validateCsrf,
  requireRole("operator"),
  createSessionValidation,
  createSessionHandler,
);

// POST /api/dryrun/sessions/:id/start - Start session (operator+)
router.post(
  "/sessions/:id/start",
  authenticate,
  validateCsrf,
  requireRole("operator"),
  startSessionValidation,
  startSessionHandler,
);

// POST /api/dryrun/sessions/:id/stop - Stop session (operator+)
router.post(
  "/sessions/:id/stop",
  authenticate,
  validateCsrf,
  requireRole("operator"),
  stopSessionValidation,
  stopSessionHandler,
);

// POST /api/dryrun/discoveries/:id/review - Review discovery (operator+)
router.post(
  "/discoveries/:id/review",
  authenticate,
  validateCsrf,
  requireRole("operator"),
  reviewDiscoveryValidation,
  reviewDiscoveryHandler,
);

/**
 * Internal endpoints (for orchestrator/collector callbacks)
 * These use internal API key authentication for service-to-service communication
 * If INTERNAL_API_KEY is not set, requests are allowed (dev mode)
 */

// POST /api/dryrun/internal/discoveries - Add discovery
router.post(
  "/internal/discoveries",
  internalApiKeyAuth,
  addDiscoveryValidation,
  addDiscoveryHandler,
);

// POST /api/dryrun/internal/containers - Register container
router.post(
  "/internal/containers",
  internalApiKeyAuth,
  registerContainerValidation,
  registerContainerHandler,
);

// POST /api/dryrun/internal/sessions/:id/complete - Mark completed
router.post(
  "/internal/sessions/:id/complete",
  internalApiKeyAuth,
  completeSessionValidation,
  completeSessionHandler,
);

/**
 * Admin endpoints (for cleanup management)
 */

// GET /api/dryrun/cleanup/status - Get cleanup scheduler status (admin only)
router.get(
  "/cleanup/status",
  authenticate,
  requireRole("admin"),
  getCleanupStatusHandler,
);

// POST /api/dryrun/cleanup/force - Force a cleanup cycle (admin only)
router.post(
  "/cleanup/force",
  authenticate,
  validateCsrf,
  requireRole("admin"),
  forceCleanupHandler,
);

export default router;
