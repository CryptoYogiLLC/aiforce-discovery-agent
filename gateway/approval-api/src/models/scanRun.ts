/**
 * Scan Run models for autonomous discovery orchestration
 * Reference: ADR-007 Discovery Acquisition Model, GitHub Issue #108
 */

import { ConfigProfile } from "./profile";

// Scan run lifecycle states (per ADR-007)
export type ScanRunStatus =
  | "pending" // Created, waiting to start
  | "scanning" // Active scanning in progress
  | "awaiting_inspection" // Scanning complete, awaiting deep inspection
  | "inspecting" // Deep inspection (DB credentials) in progress
  | "completed" // All phases complete
  | "failed" // Scan failed with error
  | "cancelled"; // Scan cancelled by user

// Individual collector states
export type CollectorStatus =
  | "pending" // Waiting to start
  | "starting" // Initializing
  | "running" // Actively collecting
  | "completed" // Finished successfully
  | "failed" // Failed with error
  | "timeout"; // Exceeded time limit

// Phase names per ADR-007
export type ScanPhase =
  | "enumeration"
  | "identification"
  | "inspection"
  | "correlation";

// Phase progress tracking
export interface PhaseProgress {
  status: "pending" | "running" | "completed" | "failed";
  progress: number; // 0-100
  discovery_count: number;
}

// Phases JSONB structure
export interface ScanPhases {
  enumeration: PhaseProgress;
  identification: PhaseProgress;
  inspection: PhaseProgress;
  correlation: PhaseProgress;
}

// Main scan run entity
export interface ScanRun {
  id: string;
  profile_id: string | null;
  config_snapshot: ConfigProfile;
  status: ScanRunStatus;
  error_message: string | null;
  phases: ScanPhases;
  total_discoveries: number;
  started_at: Date | null;
  completed_at: Date | null;
  started_by: string | null;
  created_at: Date;
  updated_at: Date;
}

// Scan run summary (from view)
export interface ScanRunSummary {
  id: string;
  status: ScanRunStatus;
  profile_id: string | null;
  profile_name: string | null;
  total_discoveries: number;
  started_by: string | null;
  started_by_username: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  phases: ScanPhases;
  collector_count: number;
  completed_collectors: number;
}

// Collector status tracking entity
export interface ScanCollector {
  id: string;
  scan_id: string;
  collector_name: string;
  status: CollectorStatus;
  progress: number; // 0-100
  discovery_count: number;
  last_sequence: number; // For idempotency
  error_message: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  last_heartbeat_at: Date | null;
  created_at: Date;
}

// Input types
export interface CreateScanInput {
  profile_id: string;
}

export interface StartScanInput {
  scan_id: string;
}

// Callback contracts from collectors (ADR-007)
export interface CollectorProgressCallback {
  scan_id: string;
  collector: string;
  sequence: number; // Monotonic counter for idempotency
  phase?: ScanPhase;
  progress: number; // 0-100
  discovery_count: number;
  message?: string;
  timestamp: string; // ISO 8601
}

export interface CollectorCompleteCallback {
  scan_id: string;
  collector: string;
  status: "completed" | "failed" | "timeout";
  discovery_count: number;
  error_message?: string;
  timestamp: string; // ISO 8601
}

// Inspection request (for deep inspection phase)
export interface InspectionTarget {
  host: string;
  port: number;
  db_type: string;
  database?: string;
  credentials: {
    username: string;
    password: string; // Will be SecretStr in Python
  };
}

export interface TriggerInspectionInput {
  targets: InspectionTarget[];
}

// Discovery with candidate metadata
export interface DiscoveryWithCandidate {
  id: string;
  event_type: string;
  source_service: string;
  payload: Record<string, unknown>;
  scan_id: string | null;
  status: string;
  created_at: Date;
  // Candidate info from payload.metadata
  database_candidate?: boolean;
  candidate_confidence?: number;
  candidate_type?: string;
  candidate_reason?: string;
}

// Default phases structure
export const DEFAULT_PHASES: ScanPhases = {
  enumeration: { status: "pending", progress: 0, discovery_count: 0 },
  identification: { status: "pending", progress: 0, discovery_count: 0 },
  inspection: { status: "pending", progress: 0, discovery_count: 0 },
  correlation: { status: "pending", progress: 0, discovery_count: 0 },
};

// Row converters
export function rowToScanRun(row: Record<string, unknown>): ScanRun {
  return {
    id: row.id as string,
    profile_id: row.profile_id as string | null,
    config_snapshot: row.config_snapshot as ConfigProfile,
    status: row.status as ScanRunStatus,
    error_message: row.error_message as string | null,
    phases: row.phases as ScanPhases,
    total_discoveries: (row.total_discoveries as number) || 0,
    started_at: row.started_at ? new Date(row.started_at as string) : null,
    completed_at: row.completed_at
      ? new Date(row.completed_at as string)
      : null,
    started_by: row.started_by as string | null,
    created_at: new Date(row.created_at as string),
    updated_at: new Date(row.updated_at as string),
  };
}

export function rowToScanRunSummary(
  row: Record<string, unknown>,
): ScanRunSummary {
  return {
    id: row.id as string,
    status: row.status as ScanRunStatus,
    profile_id: row.profile_id as string | null,
    profile_name: row.profile_name as string | null,
    total_discoveries: (row.total_discoveries as number) || 0,
    started_by: row.started_by as string | null,
    started_by_username: row.started_by_username as string | null,
    started_at: row.started_at ? new Date(row.started_at as string) : null,
    completed_at: row.completed_at
      ? new Date(row.completed_at as string)
      : null,
    created_at: new Date(row.created_at as string),
    phases: row.phases as ScanPhases,
    collector_count: parseInt(row.collector_count as string) || 0,
    completed_collectors: parseInt(row.completed_collectors as string) || 0,
  };
}

export function rowToScanCollector(
  row: Record<string, unknown>,
): ScanCollector {
  return {
    id: row.id as string,
    scan_id: row.scan_id as string,
    collector_name: row.collector_name as string,
    status: row.status as CollectorStatus,
    progress: (row.progress as number) || 0,
    discovery_count: (row.discovery_count as number) || 0,
    last_sequence: (row.last_sequence as number) || 0,
    error_message: row.error_message as string | null,
    started_at: row.started_at ? new Date(row.started_at as string) : null,
    completed_at: row.completed_at
      ? new Date(row.completed_at as string)
      : null,
    last_heartbeat_at: row.last_heartbeat_at
      ? new Date(row.last_heartbeat_at as string)
      : null,
    created_at: new Date(row.created_at as string),
  };
}

// Status helpers
export const STARTABLE_STATUSES: ScanRunStatus[] = ["pending"];
export const STOPPABLE_STATUSES: ScanRunStatus[] = [
  "pending",
  "scanning",
  "awaiting_inspection",
  "inspecting",
];
export const TERMINAL_STATUSES: ScanRunStatus[] = [
  "completed",
  "failed",
  "cancelled",
];
export const ACTIVE_STATUSES: ScanRunStatus[] = [
  "pending",
  "scanning",
  "awaiting_inspection",
  "inspecting",
];
