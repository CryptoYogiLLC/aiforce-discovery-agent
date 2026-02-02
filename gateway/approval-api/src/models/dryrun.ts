/**
 * Dry-Run Session and Discovery models
 * Reference: ADR-004 Dry-Run Orchestration Model, ADR-006 Data Partitioning, GitHub Issue #57
 */

import { ConfigProfile } from "./profile";

export type DryrunSessionStatus =
  | "pending"
  | "generating"
  | "running"
  | "completed"
  | "failed"
  | "cleaning_up"
  | "cleaned";

export type DryrunDiscoverySource =
  | "network-scanner"
  | "code-analyzer"
  | "db-inspector";

export type DryrunDiscoveryStatus = "pending" | "approved" | "rejected";

export interface DryrunSession {
  id: string;
  profile_id: string | null;
  config_snapshot: ConfigProfile;
  status: DryrunSessionStatus;
  error_message: string | null;
  container_count: number;
  network_name: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  cleanup_at: Date | null;
  started_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface DryrunSessionSummary {
  id: string;
  status: DryrunSessionStatus;
  profile_id: string | null;
  profile_name: string | null;
  container_count: number;
  started_by: string | null;
  started_by_username: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  cleanup_at: Date | null;
  created_at: Date;
  discovery_count: number;
  approved_count: number;
  rejected_count: number;
}

export interface DryrunDiscovery {
  id: string;
  session_id: string;
  source: DryrunDiscoverySource;
  discovery_type: string;
  data: Record<string, unknown>;
  status: DryrunDiscoveryStatus;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  review_notes: string | null;
  discovered_at: Date;
  created_at: Date;
}

export interface DryrunContainer {
  id: string;
  session_id: string;
  container_id: string;
  container_name: string;
  service_type: string;
  image: string;
  port_mappings: Array<{ host: number; container: number; protocol: string }>;
  status: string;
  created_at: Date;
}

export interface StartDryrunInput {
  profile_id: string;
}

export interface ReviewDiscoveryInput {
  status: "approved" | "rejected";
  notes?: string;
}

// Convert database row to DryrunSession
export function rowToSession(row: Record<string, unknown>): DryrunSession {
  return {
    id: row.id as string,
    profile_id: row.profile_id as string | null,
    config_snapshot: row.config_snapshot as ConfigProfile,
    status: row.status as DryrunSessionStatus,
    error_message: row.error_message as string | null,
    container_count: row.container_count as number,
    network_name: row.network_name as string | null,
    started_at: row.started_at ? new Date(row.started_at as string) : null,
    completed_at: row.completed_at
      ? new Date(row.completed_at as string)
      : null,
    cleanup_at: row.cleanup_at ? new Date(row.cleanup_at as string) : null,
    started_by: row.started_by as string | null,
    created_at: new Date(row.created_at as string),
    updated_at: new Date(row.updated_at as string),
  };
}

// Convert database row to DryrunSessionSummary
export function rowToSessionSummary(
  row: Record<string, unknown>,
): DryrunSessionSummary {
  return {
    id: row.id as string,
    status: row.status as DryrunSessionStatus,
    profile_id: row.profile_id as string | null,
    profile_name: row.profile_name as string | null,
    container_count: row.container_count as number,
    started_by: row.started_by as string | null,
    started_by_username: row.started_by_username as string | null,
    started_at: row.started_at ? new Date(row.started_at as string) : null,
    completed_at: row.completed_at
      ? new Date(row.completed_at as string)
      : null,
    cleanup_at: row.cleanup_at ? new Date(row.cleanup_at as string) : null,
    created_at: new Date(row.created_at as string),
    discovery_count: parseInt(row.discovery_count as string) || 0,
    approved_count: parseInt(row.approved_count as string) || 0,
    rejected_count: parseInt(row.rejected_count as string) || 0,
  };
}

// Convert database row to DryrunDiscovery
export function rowToDiscovery(row: Record<string, unknown>): DryrunDiscovery {
  return {
    id: row.id as string,
    session_id: row.session_id as string,
    source: row.source as DryrunDiscoverySource,
    discovery_type: row.discovery_type as string,
    data: row.data as Record<string, unknown>,
    status: row.status as DryrunDiscoveryStatus,
    reviewed_by: row.reviewed_by as string | null,
    reviewed_at: row.reviewed_at ? new Date(row.reviewed_at as string) : null,
    review_notes: row.review_notes as string | null,
    discovered_at: new Date(row.discovered_at as string),
    created_at: new Date(row.created_at as string),
  };
}

// Convert database row to DryrunContainer
export function rowToContainer(row: Record<string, unknown>): DryrunContainer {
  return {
    id: row.id as string,
    session_id: row.session_id as string,
    container_id: row.container_id as string,
    container_name: row.container_name as string,
    service_type: row.service_type as string,
    image: row.image as string,
    port_mappings: row.port_mappings as Array<{
      host: number;
      container: number;
      protocol: string;
    }>,
    status: row.status as string,
    created_at: new Date(row.created_at as string),
  };
}

// Session statuses that allow cleanup
export const CLEANABLE_STATUSES: DryrunSessionStatus[] = [
  "completed",
  "failed",
];

// Session statuses that are terminal (no more transitions)
export const TERMINAL_STATUSES: DryrunSessionStatus[] = ["cleaned"];

// Session statuses that are active (in progress)
export const ACTIVE_STATUSES: DryrunSessionStatus[] = [
  "pending",
  "generating",
  "running",
  "cleaning_up",
];
