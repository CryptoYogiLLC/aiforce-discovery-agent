/**
 * User model and types for RBAC
 * Reference: ADR-003 Session Security Model, GitHub Issue #61
 */

export type UserRole = "admin" | "operator" | "viewer";

export interface User {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  role: UserRole;
  is_active: boolean;
  last_login_at: Date | null;
  password_changed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface UserPublic {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  last_login_at: Date | null;
  created_at: Date;
}

export interface CreateUserInput {
  username: string;
  email: string;
  password: string;
  role?: UserRole;
}

export interface UpdateUserInput {
  email?: string;
  role?: UserRole;
  is_active?: boolean;
}

export interface Permission {
  id: string;
  role: UserRole;
  permission: string;
  created_at: Date;
}

// Role hierarchy for permission checks
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  admin: 3,
  operator: 2,
  viewer: 1,
};

// Check if a role has at least the required level
export function hasRoleLevel(
  userRole: UserRole,
  requiredRole: UserRole,
): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

// Convert database row to User
export function rowToUser(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    username: row.username as string,
    email: row.email as string,
    password_hash: row.password_hash as string,
    role: row.role as UserRole,
    is_active: row.is_active as boolean,
    last_login_at: row.last_login_at
      ? new Date(row.last_login_at as string)
      : null,
    password_changed_at: row.password_changed_at
      ? new Date(row.password_changed_at as string)
      : null,
    created_at: new Date(row.created_at as string),
    updated_at: new Date(row.updated_at as string),
  };
}

// Convert User to public representation (no password hash)
export function toPublicUser(user: User): UserPublic {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    is_active: user.is_active,
    last_login_at: user.last_login_at,
    created_at: user.created_at,
  };
}
