/**
 * Authentication routes
 * Reference: ADR-003 Session Security Model, GitHub Issue #62
 */

import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  login,
  loginValidation,
  logout,
  refresh,
  me,
  changePasswordHandler,
  changePasswordValidation,
  resetPassword,
  resetPasswordValidation,
  recover,
  recoverValidation,
  logoutAll,
  logoutAllValidation,
} from "../controllers/authController";
import { authenticate, validateCsrf, requireRole } from "../middleware/auth";

const router = Router();

// Rate limiting for login attempts (5 attempts per 15 minutes per IP)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { error: "Too many login attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting for recovery attempts (per username+IP to prevent distributed attacks)
const recoveryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { error: "Too many recovery attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit by combination of username and IP to prevent distributed brute-force
    const username = (req.body?.username as string) || "unknown";
    return `${req.ip}-${username}`;
  },
});

/**
 * Public routes (no authentication required)
 */

// POST /api/auth/login - Authenticate and create session
router.post("/login", loginLimiter, loginValidation, login);

// POST /api/auth/recover - Use recovery code to reset password
router.post("/recover", recoveryLimiter, recoverValidation, recover);

/**
 * Authenticated routes
 */

// POST /api/auth/logout - Destroy session
router.post("/logout", authenticate, validateCsrf, logout);

// POST /api/auth/refresh - Extend session
router.post("/refresh", authenticate, validateCsrf, refresh);

// GET /api/auth/me - Get current user info
router.get("/me", authenticate, me);

// POST /api/auth/change-password - Change own password
router.post(
  "/change-password",
  authenticate,
  validateCsrf,
  changePasswordValidation,
  changePasswordHandler,
);

// POST /api/auth/logout-all - Logout from all sessions
router.post(
  "/logout-all",
  authenticate,
  validateCsrf,
  logoutAllValidation,
  logoutAll,
);

/**
 * Admin-only routes
 */

// POST /api/auth/reset-password - Generate recovery code for a user
router.post(
  "/reset-password",
  authenticate,
  validateCsrf,
  requireRole("admin"),
  resetPasswordValidation,
  resetPassword,
);

export default router;
