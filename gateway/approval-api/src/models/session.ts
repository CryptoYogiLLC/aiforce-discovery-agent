/**
 * Session model and types for server-side session management
 * Reference: ADR-003 Session Security Model, GitHub Issue #62
 */

import { UserPublic } from "./user";

export interface Session {
  id: string;
  user_id: string;
  csrf_token: string;
  ip_address: string | null;
  user_agent: string | null;
  expires_at: Date;
  created_at: Date;
}

export interface SessionWithUser extends Session {
  user: UserPublic;
}

export interface RecoveryCode {
  id: string;
  user_id: string;
  code_hash: string;
  created_by: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
}

export interface CreateSessionInput {
  user_id: string;
  csrf_token: string;
  ip_address?: string;
  user_agent?: string;
  expires_at: Date;
}

// Session configuration
export const SESSION_CONFIG = {
  // Session duration in milliseconds (2 hours default)
  DURATION_MS: 2 * 60 * 60 * 1000,
  // Cookie name
  COOKIE_NAME: "session_id",
  // CSRF header name
  CSRF_HEADER: "x-csrf-token",
  // Recovery code expiry (24 hours)
  RECOVERY_CODE_EXPIRY_MS: 24 * 60 * 60 * 1000,
};

// Convert database row to Session
export function rowToSession(row: Record<string, unknown>): Session {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    csrf_token: row.csrf_token as string,
    ip_address: row.ip_address as string | null,
    user_agent: row.user_agent as string | null,
    expires_at: new Date(row.expires_at as string),
    created_at: new Date(row.created_at as string),
  };
}

// Convert database row to RecoveryCode
export function rowToRecoveryCode(row: Record<string, unknown>): RecoveryCode {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    code_hash: row.code_hash as string,
    created_by: row.created_by as string,
    expires_at: new Date(row.expires_at as string),
    used_at: row.used_at ? new Date(row.used_at as string) : null,
    created_at: new Date(row.created_at as string),
  };
}
