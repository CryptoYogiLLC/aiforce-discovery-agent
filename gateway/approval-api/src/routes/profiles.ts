/**
 * Configuration Profile routes
 * Reference: ADR-005 Configuration Propagation Model, GitHub Issue #56
 */

import { Router } from "express";
import {
  listProfilesHandler,
  listProfilesValidation,
  getProfileHandler,
  getProfileValidation,
  createProfileHandler,
  createProfileValidation,
  cloneProfileHandler,
  cloneProfileValidation,
  updateProfileHandler,
  updateProfileValidation,
  deleteProfileHandler,
  deleteProfileValidation,
  exportProfileHandler,
  exportProfileValidation,
  importProfileHandler,
  importProfileValidation,
} from "../controllers/profileController";
import { authenticate, validateCsrf, requireRole } from "../middleware/auth";

const router = Router();

/**
 * All profile routes require authentication
 */

// GET /api/profiles - List all profiles (viewer+)
router.get("/", authenticate, listProfilesValidation, listProfilesHandler);

// GET /api/profiles/:id - Get profile by ID (viewer+)
router.get("/:id", authenticate, getProfileValidation, getProfileHandler);

// GET /api/profiles/:id/export - Export profile as YAML (viewer+)
router.get(
  "/:id/export",
  authenticate,
  exportProfileValidation,
  exportProfileHandler,
);

// POST /api/profiles - Create new profile (operator+)
router.post(
  "/",
  authenticate,
  validateCsrf,
  requireRole("operator"),
  createProfileValidation,
  createProfileHandler,
);

// POST /api/profiles/import - Import profile from YAML (operator+)
router.post(
  "/import",
  authenticate,
  validateCsrf,
  requireRole("operator"),
  importProfileValidation,
  importProfileHandler,
);

// POST /api/profiles/:id/clone - Clone a profile (operator+)
router.post(
  "/:id/clone",
  authenticate,
  validateCsrf,
  requireRole("operator"),
  cloneProfileValidation,
  cloneProfileHandler,
);

// PATCH /api/profiles/:id - Update profile (operator+)
router.patch(
  "/:id",
  authenticate,
  validateCsrf,
  requireRole("operator"),
  updateProfileValidation,
  updateProfileHandler,
);

// DELETE /api/profiles/:id - Delete profile (admin only)
router.delete(
  "/:id",
  authenticate,
  validateCsrf,
  requireRole("admin"),
  deleteProfileValidation,
  deleteProfileHandler,
);

export default router;
