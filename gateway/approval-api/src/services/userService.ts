/**
 * User management service
 * Reference: GitHub Issue #64
 */

import { pool } from "./database";
import {
  UserPublic,
  CreateUserInput,
  UpdateUserInput,
  rowToUser,
  toPublicUser,
  UserRole,
} from "../models/user";
import { hashPassword, deleteAllUserSessions } from "./sessionService";
import { logger } from "./logger";

/**
 * Create a new user
 */
export async function createUser(input: CreateUserInput): Promise<UserPublic> {
  const passwordHash = await hashPassword(input.password);

  const result = await pool.query(
    `INSERT INTO gateway.users (username, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [input.username, input.email, passwordHash, input.role || "viewer"],
  );

  const user = rowToUser(result.rows[0] as Record<string, unknown>);
  logger.info("User created", { userId: user.id, username: user.username });
  return toPublicUser(user);
}

/**
 * Get user by ID
 */
export async function getUserById(id: string): Promise<UserPublic | null> {
  const result = await pool.query("SELECT * FROM gateway.users WHERE id = $1", [
    id,
  ]);

  if (result.rows.length === 0) {
    return null;
  }

  return toPublicUser(rowToUser(result.rows[0] as Record<string, unknown>));
}

/**
 * Get user by username
 */
export async function getUserByUsername(
  username: string,
): Promise<UserPublic | null> {
  const result = await pool.query(
    "SELECT * FROM gateway.users WHERE username = $1",
    [username],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return toPublicUser(rowToUser(result.rows[0] as Record<string, unknown>));
}

/**
 * List all users with pagination
 */
export async function listUsers(
  page: number = 1,
  limit: number = 20,
  filters?: { role?: UserRole; is_active?: boolean },
): Promise<{
  users: UserPublic[];
  total: number;
  page: number;
  limit: number;
}> {
  const offset = (page - 1) * limit;
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters?.role) {
    conditions.push(`role = $${paramIndex++}`);
    params.push(filters.role);
  }

  if (filters?.is_active !== undefined) {
    conditions.push(`is_active = $${paramIndex++}`);
    params.push(filters.is_active);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM gateway.users ${whereClause}`,
    params,
  );
  const total = parseInt(
    (countResult.rows[0] as Record<string, unknown>).count as string,
  );

  const result = await pool.query(
    `SELECT * FROM gateway.users ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...params, limit, offset],
  );

  const users = result.rows.map((row) =>
    toPublicUser(rowToUser(row as Record<string, unknown>)),
  );

  return { users, total, page, limit };
}

/**
 * Update user
 */
export async function updateUser(
  id: string,
  input: UpdateUserInput,
): Promise<UserPublic | null> {
  const updates: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (input.email !== undefined) {
    updates.push(`email = $${paramIndex++}`);
    params.push(input.email);
  }

  if (input.role !== undefined) {
    updates.push(`role = $${paramIndex++}`);
    params.push(input.role);
  }

  if (input.is_active !== undefined) {
    updates.push(`is_active = $${paramIndex++}`);
    params.push(input.is_active);

    // If deactivating, invalidate all sessions
    if (!input.is_active) {
      await deleteAllUserSessions(id);
    }
  }

  if (updates.length === 0) {
    return getUserById(id);
  }

  params.push(id);
  const result = await pool.query(
    `UPDATE gateway.users SET ${updates.join(", ")}
     WHERE id = $${paramIndex}
     RETURNING *`,
    params,
  );

  if (result.rows.length === 0) {
    return null;
  }

  const user = rowToUser(result.rows[0] as Record<string, unknown>);
  logger.info("User updated", { userId: user.id, updates: input });

  // If role changed, invalidate all sessions for security
  if (input.role !== undefined) {
    await deleteAllUserSessions(id);
  }

  return toPublicUser(user);
}

/**
 * Deactivate user (soft delete)
 */
export async function deactivateUser(id: string): Promise<boolean> {
  const result = await pool.query(
    "UPDATE gateway.users SET is_active = false WHERE id = $1 RETURNING id",
    [id],
  );

  if (result.rows.length === 0) {
    return false;
  }

  // Invalidate all sessions
  await deleteAllUserSessions(id);

  logger.info("User deactivated", { userId: id });
  return true;
}

/**
 * Reactivate user
 */
export async function reactivateUser(id: string): Promise<boolean> {
  const result = await pool.query(
    "UPDATE gateway.users SET is_active = true WHERE id = $1 RETURNING id",
    [id],
  );

  if (result.rows.length === 0) {
    return false;
  }

  logger.info("User reactivated", { userId: id });
  return true;
}

/**
 * Check if username exists
 */
export async function usernameExists(username: string): Promise<boolean> {
  const result = await pool.query(
    "SELECT 1 FROM gateway.users WHERE username = $1",
    [username],
  );
  return result.rows.length > 0;
}

/**
 * Check if email exists
 */
export async function emailExists(email: string): Promise<boolean> {
  const result = await pool.query(
    "SELECT 1 FROM gateway.users WHERE email = $1",
    [email],
  );
  return result.rows.length > 0;
}

/**
 * Get user's permissions
 */
export async function getUserPermissions(userId: string): Promise<string[]> {
  const result = await pool.query(
    `SELECT rp.permission
     FROM gateway.role_permissions rp
     JOIN gateway.users u ON u.role = rp.role
     WHERE u.id = $1`,
    [userId],
  );

  return result.rows.map(
    (row) => (row as Record<string, unknown>).permission as string,
  );
}
