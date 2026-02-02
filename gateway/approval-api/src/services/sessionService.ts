/**
 * Session service for server-side session management
 * Reference: ADR-003 Session Security Model, GitHub Issue #62
 */

import crypto from "crypto";
import argon2 from "argon2";
import { pool } from "./database";
import { User, UserRole, rowToUser, UserPublic } from "../models/user";
import {
  SessionWithUser,
  rowToSession,
  SESSION_CONFIG,
  rowToRecoveryCode,
} from "../models/session";
import { logger } from "./logger";

/**
 * Create a new session for a user
 * Implements session fixation prevention by always creating new session
 */
export async function createSession(
  userId: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<{ sessionId: string; csrfToken: string }> {
  const sessionId = crypto.randomUUID();
  const csrfToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_CONFIG.DURATION_MS);

  await pool.query(
    `INSERT INTO gateway.sessions (id, user_id, csrf_token, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      sessionId,
      userId,
      csrfToken,
      ipAddress || null,
      userAgent || null,
      expiresAt,
    ],
  );

  // Note: Don't log sessionId as it's a bearer-equivalent secret
  logger.info("Session created", { userId, expiresAt });
  return { sessionId, csrfToken };
}

/**
 * Get session by ID with user data
 */
export async function getSessionWithUser(
  sessionId: string,
): Promise<SessionWithUser | null> {
  const result = await pool.query(
    `SELECT s.*, u.id as user_id, u.username, u.email, u.role, u.is_active, u.last_login_at, u.created_at as user_created_at
     FROM gateway.sessions s
     JOIN gateway.users u ON s.user_id = u.id
     WHERE s.id = $1 AND s.expires_at > NOW() AND u.is_active = true`,
    [sessionId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0] as Record<string, unknown>;
  const session = rowToSession(row);
  const user: UserPublic = {
    id: row.user_id as string,
    username: row.username as string,
    email: row.email as string,
    role: row.role as UserRole,
    is_active: row.is_active as boolean,
    last_login_at: row.last_login_at
      ? new Date(row.last_login_at as string)
      : null,
    created_at: new Date(row.user_created_at as string),
  };

  return { ...session, user };
}

/**
 * Delete a session (logout)
 */
export async function deleteSession(sessionId: string): Promise<void> {
  await pool.query("DELETE FROM gateway.sessions WHERE id = $1", [sessionId]);
  // Note: Don't log sessionId as it's a bearer-equivalent secret
  logger.info("Session deleted");
}

/**
 * Delete all sessions for a user (force logout everywhere)
 */
export async function deleteAllUserSessions(userId: string): Promise<number> {
  const result = await pool.query(
    "DELETE FROM gateway.sessions WHERE user_id = $1",
    [userId],
  );
  logger.info("All user sessions deleted", { userId, count: result.rowCount });
  return result.rowCount || 0;
}

/**
 * Extend session expiry (sliding window)
 */
export async function extendSession(sessionId: string): Promise<Date | null> {
  const expiresAt = new Date(Date.now() + SESSION_CONFIG.DURATION_MS);
  const result = await pool.query(
    "UPDATE gateway.sessions SET expires_at = $1 WHERE id = $2 AND expires_at > NOW() RETURNING expires_at",
    [expiresAt, sessionId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return new Date(
    (result.rows[0] as Record<string, unknown>).expires_at as string,
  );
}

/**
 * Validate user credentials and return user if valid
 */
export async function validateCredentials(
  username: string,
  password: string,
): Promise<User | null> {
  const result = await pool.query(
    "SELECT * FROM gateway.users WHERE username = $1 AND is_active = true",
    [username],
  );

  if (result.rows.length === 0) {
    return null;
  }

  const user = rowToUser(result.rows[0] as Record<string, unknown>);

  try {
    const valid = await argon2.verify(user.password_hash, password);
    if (!valid) {
      return null;
    }
  } catch {
    // Invalid hash format or other error
    logger.error("Password verification failed", { username });
    return null;
  }

  return user;
}

/**
 * Update last login timestamp
 */
export async function updateLastLogin(userId: string): Promise<void> {
  await pool.query(
    "UPDATE gateway.users SET last_login_at = NOW() WHERE id = $1",
    [userId],
  );
}

/**
 * Hash a password using Argon2id
 * Per ADR-003: Use Argon2id with 64MB memory, 3 iterations, 4 parallelism
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536, // 64 MB
    timeCost: 3,
    parallelism: 4,
  });
}

/**
 * Change user password
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<boolean> {
  const result = await pool.query(
    "SELECT password_hash FROM gateway.users WHERE id = $1",
    [userId],
  );
  if (result.rows.length === 0) {
    return false;
  }

  const valid = await argon2.verify(
    (result.rows[0] as Record<string, unknown>).password_hash as string,
    currentPassword,
  );
  if (!valid) {
    return false;
  }

  const newHash = await hashPassword(newPassword);
  await pool.query(
    "UPDATE gateway.users SET password_hash = $1, password_changed_at = NOW() WHERE id = $2",
    [newHash, userId],
  );

  // Invalidate all other sessions (security measure)
  await deleteAllUserSessions(userId);

  logger.info("Password changed", { userId });
  return true;
}

/**
 * Generate recovery code for password reset (air-gap compatible)
 */
export async function generateRecoveryCode(
  targetUserId: string,
  createdByUserId: string,
): Promise<{ code: string; expiresAt: Date }> {
  // Generate a readable recovery code (16 chars hex = 64 bits entropy)
  // Increased from 8 chars to prevent realistic brute-force attacks
  const code = crypto.randomBytes(8).toString("hex").toUpperCase();
  const codeHash = await hashPassword(code);
  const expiresAt = new Date(
    Date.now() + SESSION_CONFIG.RECOVERY_CODE_EXPIRY_MS,
  );

  // Invalidate any existing recovery codes for this user
  await pool.query(
    "UPDATE gateway.recovery_codes SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL",
    [targetUserId],
  );

  await pool.query(
    `INSERT INTO gateway.recovery_codes (user_id, code_hash, created_by, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [targetUserId, codeHash, createdByUserId, expiresAt],
  );

  logger.info("Recovery code generated", {
    targetUserId,
    createdByUserId,
    expiresAt,
  });
  return { code, expiresAt };
}

/**
 * Verify and use recovery code
 */
export async function useRecoveryCode(
  userId: string,
  code: string,
  newPassword: string,
): Promise<boolean> {
  const result = await pool.query(
    `SELECT * FROM gateway.recovery_codes
     WHERE user_id = $1 AND used_at IS NULL AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );

  if (result.rows.length === 0) {
    return false;
  }

  const recoveryCode = rowToRecoveryCode(
    result.rows[0] as Record<string, unknown>,
  );

  const valid = await argon2.verify(recoveryCode.code_hash, code);
  if (!valid) {
    return false;
  }

  // Mark code as used
  await pool.query(
    "UPDATE gateway.recovery_codes SET used_at = NOW() WHERE id = $1",
    [recoveryCode.id],
  );

  // Update password
  const newHash = await hashPassword(newPassword);
  await pool.query(
    "UPDATE gateway.users SET password_hash = $1, password_changed_at = NOW() WHERE id = $2",
    [newHash, userId],
  );

  // Invalidate all sessions
  await deleteAllUserSessions(userId);

  logger.info("Password reset via recovery code", { userId });
  return true;
}

/**
 * Clean up expired sessions
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const result = await pool.query("SELECT gateway.cleanup_expired_sessions()");
  return (result.rows[0] as Record<string, unknown>)
    .cleanup_expired_sessions as number;
}
