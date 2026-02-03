export interface Discovery {
  id: string;
  event_type: string;
  source_service: string;
  payload: Record<string, unknown>;
  status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLogEntry {
  id: string;
  discovery_id: string;
  action: string;
  actor: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Dry-Run Types
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
  config_snapshot: Record<string, unknown>;
  status: DryrunSessionStatus;
  error_message: string | null;
  container_count: number;
  network_name: string | null;
  started_at: string | null;
  completed_at: string | null;
  cleanup_at: string | null;
  started_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DryrunSessionSummary {
  id: string;
  status: DryrunSessionStatus;
  profile_id: string | null;
  profile_name: string | null;
  container_count: number;
  started_by: string | null;
  started_by_username: string | null;
  started_at: string | null;
  completed_at: string | null;
  cleanup_at: string | null;
  created_at: string;
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
  reviewed_at: string | null;
  review_notes: string | null;
  discovered_at: string;
  created_at: string;
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
  created_at: string;
}

export interface ConfigProfile {
  id: string;
  name: string;
  description: string | null;
  config: Record<string, unknown>;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface DryrunStartOptions {
  profile_id: string;
  seed?: number;
}
