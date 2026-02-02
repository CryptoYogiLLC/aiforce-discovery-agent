/**
 * Authentication and authorization middleware
 * Reference: ADR-003 Session Security Model, GitHub Issue #63
 */

import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { getSessionWithUser } from "../services/sessionService";
import { UserPublic, UserRole, hasRoleLevel } from "../models/user";
import { SESSION_CONFIG } from "../models/session";
import { logger } from "../services/logger";
import { pool } from "../services/database";

// Extend Express Request to include user
declare module "express-serve-static-core" {
  interface Request {
    user?: UserPublic;
    sessionId?: string;
    csrfToken?: string;
  }
}

/**
 * Authentication middleware - validates session from httpOnly cookie
 */
export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const sessionId = req.cookies?.[SESSION_CONFIG.COOKIE_NAME];

  if (!sessionId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  getSessionWithUser(sessionId)
    .then((session) => {
      if (!session) {
        res.clearCookie(SESSION_CONFIG.COOKIE_NAME);
        res.status(401).json({ error: "Invalid or expired session" });
        return;
      }

      req.user = session.user;
      req.sessionId = session.id;
      req.csrfToken = session.csrf_token;
      next();
    })
    .catch((err) => {
      logger.error("Authentication error", { error: err.message });
      res.status(500).json({ error: "Authentication failed" });
    });
}

/**
 * CSRF validation middleware - for state-changing requests (POST, PUT, DELETE)
 */
export function validateCsrf(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Skip CSRF for safe methods
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }

  const csrfHeader = req.headers[SESSION_CONFIG.CSRF_HEADER] as string;

  // Use timing-safe comparison to prevent timing attacks
  try {
    const csrfToken = req.csrfToken || "";
    const clientToken = Buffer.from(csrfHeader || "");
    const serverToken = Buffer.from(csrfToken);

    if (
      clientToken.length !== serverToken.length ||
      !crypto.timingSafeEqual(clientToken, serverToken)
    ) {
      logAuthEvent(req, "csrf_validation_failed", false);
      res.status(403).json({ error: "Invalid CSRF token" });
      return;
    }
  } catch {
    logAuthEvent(req, "csrf_validation_failed", false);
    res.status(403).json({ error: "Invalid CSRF token" });
    return;
  }

  next();
}

/**
 * Authorization middleware factory - requires minimum role level
 */
export function requireRole(minimumRole: UserRole) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!hasRoleLevel(req.user.role, minimumRole)) {
      logAuthEvent(req, `access_denied:${minimumRole}`, false);
      res.status(403).json({
        error: "Insufficient permissions",
        required: minimumRole,
        current: req.user.role,
      });
      return;
    }

    next();
  };
}

/**
 * Permission check middleware factory - requires specific permission
 */
export function requirePermission(permission: string) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    try {
      const result = await pool.query(
        "SELECT 1 FROM gateway.role_permissions WHERE role = $1 AND permission = $2",
        [req.user.role, permission],
      );

      if (result.rows.length === 0) {
        logAuthEvent(req, `permission_denied:${permission}`, false);
        res.status(403).json({
          error: "Permission denied",
          required: permission,
        });
        return;
      }

      next();
    } catch (err) {
      logger.error("Permission check error", { error: (err as Error).message });
      res.status(500).json({ error: "Authorization check failed" });
    }
  };
}

// Valid audit event types for auth actions
type AuthEventType =
  | "user_login"
  | "login_failed"
  | "user_logout"
  | "password_changed"
  | "session_created"
  | "session_destroyed"
  | "access_denied"
  | "csrf_failed";

/**
 * Log authentication/authorization events for audit
 * Uses the new audit_log schema with proper ENUM event types
 */
export async function logAuthEvent(
  req: Request,
  action: string,
  success: boolean,
  details?: Record<string, unknown>,
): Promise<void> {
  // Map action strings to valid ENUM values
  let eventType: AuthEventType;
  if (action === "login_success") {
    eventType = "user_login";
  } else if (action === "login_failed") {
    eventType = "login_failed";
  } else if (action === "logout") {
    eventType = "user_logout";
  } else if (
    action === "password_changed" ||
    action === "password_change_failed"
  ) {
    eventType = "password_changed";
  } else if (action === "password_recovered") {
    eventType = "password_changed";
  } else if (action.startsWith("csrf_")) {
    eventType = "csrf_failed";
  } else if (
    action.startsWith("access_denied") ||
    action.startsWith("permission_denied")
  ) {
    eventType = "access_denied";
  } else if (
    action === "recovery_code_generated" ||
    action === "recovery_failed"
  ) {
    eventType = "password_changed";
  } else if (action === "logout_all") {
    eventType = "session_destroyed";
  } else {
    // Default to access_denied for unknown auth events
    eventType = "access_denied";
  }

  try {
    await pool.query(
      `INSERT INTO gateway.audit_log (event_type, actor_id, actor_username, actor_ip, target_type, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        eventType,
        req.user?.id || null,
        req.user?.username || null,
        req.ip || null,
        "session",
        JSON.stringify({
          action, // Store original action for specificity
          success,
          user_agent: req.headers["user-agent"],
          path: req.path,
          method: req.method,
          ...details,
        }),
      ],
    );
  } catch (err) {
    logger.error("Failed to log auth event", { error: (err as Error).message });
  }
}

/**
 * Optional authentication - populates user if session exists but doesn't require it
 */
export function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const sessionId = req.cookies?.[SESSION_CONFIG.COOKIE_NAME];

  if (!sessionId) {
    next();
    return;
  }

  getSessionWithUser(sessionId)
    .then((session) => {
      if (session) {
        req.user = session.user;
        req.sessionId = session.id;
        req.csrfToken = session.csrf_token;
      }
      next();
    })
    .catch((err) => {
      // Log errors but still proceed since auth is optional
      logger.error("Optional auth failed", { error: (err as Error).message });
      next();
    });
}
