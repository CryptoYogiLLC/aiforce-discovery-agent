/**
 * Authentication controller
 * Reference: ADR-003 Session Security Model, GitHub Issue #62
 */

import { Request, Response } from "express";
import { body, validationResult } from "express-validator";
import argon2 from "argon2";
import {
  createSession,
  deleteSession,
  validateCredentials,
  updateLastLogin,
  extendSession,
  changePassword,
  generateRecoveryCode,
  useRecoveryCode,
  deleteAllUserSessions,
} from "../services/sessionService";
import { toPublicUser } from "../models/user";
import { SESSION_CONFIG } from "../models/session";
import { logAuthEvent } from "../middleware/auth";
import { logger } from "../services/logger";
import { pool } from "../services/database";

// Cookie options per ADR-003
const getCookieOptions = (maxAge?: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  maxAge: maxAge ?? SESSION_CONFIG.DURATION_MS,
  path: "/",
});

/**
 * POST /api/auth/login
 * Authenticate user and create session
 */
export const loginValidation = [
  body("username")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Username is required"),
  body("password").isString().notEmpty().withMessage("Password is required"),
];

export async function login(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  const { username, password } = req.body;

  try {
    const user = await validateCredentials(username, password);

    if (!user) {
      await logAuthEvent(req, "login_failed", false, { username });
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    // Session fixation prevention: always create new session
    const { sessionId, csrfToken } = await createSession(
      user.id,
      req.ip,
      req.headers["user-agent"],
    );

    await updateLastLogin(user.id);
    await logAuthEvent(req, "login_success", true, { userId: user.id });

    // Set httpOnly cookie
    res.cookie(SESSION_CONFIG.COOKIE_NAME, sessionId, getCookieOptions());

    // Return user info and CSRF token (CSRF token via header, not cookie)
    res.setHeader(SESSION_CONFIG.CSRF_HEADER, csrfToken);
    res.json({
      user: toPublicUser(user),
      csrf_token: csrfToken, // Also in body for initial setup
    });
  } catch (err) {
    logger.error("Login error", { error: (err as Error).message });
    res.status(500).json({ error: "Login failed" });
  }
}

/**
 * POST /api/auth/logout
 * Destroy session and clear cookie
 */
export async function logout(req: Request, res: Response): Promise<void> {
  try {
    if (req.sessionId) {
      await deleteSession(req.sessionId);
      await logAuthEvent(req, "logout", true);
    }

    res.clearCookie(SESSION_CONFIG.COOKIE_NAME, getCookieOptions(0));
    res.json({ message: "Logged out successfully" });
  } catch (err) {
    logger.error("Logout error", { error: (err as Error).message });
    res.status(500).json({ error: "Logout failed" });
  }
}

/**
 * POST /api/auth/refresh
 * Extend session expiry
 */
export async function refresh(req: Request, res: Response): Promise<void> {
  try {
    if (!req.sessionId) {
      res.status(401).json({ error: "No active session" });
      return;
    }

    const newExpiry = await extendSession(req.sessionId);

    if (!newExpiry) {
      res.clearCookie(SESSION_CONFIG.COOKIE_NAME, getCookieOptions(0));
      res.status(401).json({ error: "Session expired" });
      return;
    }

    // Refresh cookie
    res.cookie(SESSION_CONFIG.COOKIE_NAME, req.sessionId, getCookieOptions());
    res.json({ expires_at: newExpiry });
  } catch (err) {
    logger.error("Session refresh error", { error: (err as Error).message });
    res.status(500).json({ error: "Session refresh failed" });
  }
}

/**
 * GET /api/auth/me
 * Get current user info
 */
export async function me(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  res.json({ user: req.user });
}

/**
 * POST /api/auth/change-password
 * Change current user's password
 */
export const changePasswordValidation = [
  body("current_password")
    .isString()
    .notEmpty()
    .withMessage("Current password is required"),
  body("new_password")
    .isString()
    .isLength({ min: 12 })
    .withMessage("New password must be at least 12 characters"),
];

export async function changePasswordHandler(
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

  const { current_password, new_password } = req.body;

  try {
    const success = await changePassword(
      req.user.id,
      current_password,
      new_password,
    );

    if (!success) {
      await logAuthEvent(req, "password_change_failed", false);
      res.status(400).json({ error: "Current password is incorrect" });
      return;
    }

    await logAuthEvent(req, "password_changed", true);

    // Clear session cookie (user needs to log in again)
    res.clearCookie(SESSION_CONFIG.COOKIE_NAME, getCookieOptions(0));
    res.json({
      message: "Password changed successfully. Please log in again.",
    });
  } catch (err) {
    logger.error("Password change error", { error: (err as Error).message });
    res.status(500).json({ error: "Password change failed" });
  }
}

/**
 * POST /api/auth/reset-password (Admin only)
 * Generate recovery code for a user
 */
export const resetPasswordValidation = [
  body("user_id").isUUID().withMessage("Valid user ID is required"),
];

export async function resetPassword(
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

  const { user_id } = req.body;

  try {
    // Verify target user exists
    const userResult = await pool.query(
      "SELECT id, username FROM gateway.users WHERE id = $1",
      [user_id],
    );

    if (userResult.rows.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const { code, expiresAt } = await generateRecoveryCode(
      user_id,
      req.user.id,
    );

    await logAuthEvent(req, "recovery_code_generated", true, {
      target_user_id: user_id,
      target_username: (userResult.rows[0] as Record<string, unknown>).username,
    });

    res.json({
      recovery_code: code,
      expires_at: expiresAt,
      message:
        "Communicate this code to the user out-of-band. It expires in 24 hours.",
    });
  } catch (err) {
    logger.error("Recovery code generation error", {
      error: (err as Error).message,
    });
    res.status(500).json({ error: "Failed to generate recovery code" });
  }
}

/**
 * POST /api/auth/recover
 * Use recovery code to set new password
 */
export const recoverValidation = [
  body("username")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Username is required"),
  body("recovery_code")
    .isString()
    .notEmpty()
    .withMessage("Recovery code is required"),
  body("new_password")
    .isString()
    .isLength({ min: 12 })
    .withMessage("New password must be at least 12 characters"),
];

export async function recover(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  const { username, recovery_code, new_password } = req.body;

  try {
    // Find user by username
    const userResult = await pool.query(
      "SELECT id FROM gateway.users WHERE username = $1",
      [username],
    );

    if (userResult.rows.length === 0) {
      // Timing attack prevention: perform dummy hash verification
      // to ensure consistent response time whether user exists or not
      try {
        await argon2.verify(
          "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG",
          recovery_code,
        );
      } catch {
        // Expected to fail, just for timing consistency
      }
      await logAuthEvent(req, "recovery_failed", false, { username });
      res.status(400).json({ error: "Invalid or expired recovery code" });
      return;
    }

    const userId = (userResult.rows[0] as Record<string, unknown>).id as string;
    const success = await useRecoveryCode(userId, recovery_code, new_password);

    if (!success) {
      await logAuthEvent(req, "recovery_failed", false, { username });
      res.status(400).json({ error: "Invalid or expired recovery code" });
      return;
    }

    await logAuthEvent(req, "password_recovered", true, { userId });
    res.json({
      message:
        "Password reset successfully. Please log in with your new password.",
    });
  } catch (err) {
    logger.error("Password recovery error", { error: (err as Error).message });
    res.status(500).json({ error: "Password recovery failed" });
  }
}

/**
 * POST /api/auth/logout-all
 * Logout from all sessions (Admin only for other users)
 */
export const logoutAllValidation = [
  body("user_id").optional().isUUID().withMessage("Valid user ID is required"),
];

export async function logoutAll(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const targetUserId = req.body.user_id || req.user.id;

  // Only admins can logout other users
  if (targetUserId !== req.user.id && req.user.role !== "admin") {
    res.status(403).json({ error: "Cannot logout other users" });
    return;
  }

  try {
    const count = await deleteAllUserSessions(targetUserId);
    await logAuthEvent(req, "logout_all", true, {
      targetUserId,
      sessionsDeleted: count,
    });

    // Clear own cookie if logging out self
    if (targetUserId === req.user.id) {
      res.clearCookie(SESSION_CONFIG.COOKIE_NAME, getCookieOptions(0));
    }

    res.json({ message: `Logged out from ${count} session(s)` });
  } catch (err) {
    logger.error("Logout all error", { error: (err as Error).message });
    res.status(500).json({ error: "Failed to logout from all sessions" });
  }
}
