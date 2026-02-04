export interface Discovery {
  id: string;
  event_type: string;
  source_service: string;
  payload: Record<string, unknown>;
  status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
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

// User Management Types
export type UserRole = "admin" | "operator" | "viewer";

export interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserListResult {
  users: User[];
  total: number;
  page: number;
  limit: number;
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

// Scan Types (ADR-007)
export type ScanRunStatus =
  | "pending"
  | "scanning"
  | "awaiting_inspection"
  | "inspecting"
  | "completed"
  | "failed"
  | "cancelled";

export type CollectorStatus =
  | "pending"
  | "starting"
  | "running"
  | "completed"
  | "failed"
  | "timeout";

export interface ScanPhase {
  status: "pending" | "running" | "completed" | "failed";
  progress: number;
  discovery_count: number;
}

export interface ScanRun {
  id: string;
  profile_id: string | null;
  config_snapshot: Record<string, unknown>;
  status: ScanRunStatus;
  error_message: string | null;
  phases: {
    enumeration: ScanPhase;
    identification: ScanPhase;
    inspection: ScanPhase;
    correlation: ScanPhase;
  };
  total_discoveries: number;
  started_at: string | null;
  completed_at: string | null;
  started_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScanCollector {
  id: string;
  scan_id: string;
  collector_name: string;
  status: CollectorStatus;
  progress: number;
  discovery_count: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  last_heartbeat_at: string | null;
}

export interface ScanDiscovery {
  id: string;
  event_type: string;
  source_service: string;
  payload: Record<string, unknown>;
  scan_id: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

export interface DatabaseCandidateMetadata {
  database_candidate?: boolean;
  candidate_type?: string;
  candidate_confidence?: number;
  candidate_reason?: string;
  validation_method?: string;
  banner_mismatch?: boolean;
  identified_by?: string;
}

export interface DatabaseCandidate extends ScanDiscovery {
  payload: {
    host?: string;
    port?: number;
    ip_address?: string;
    metadata?: DatabaseCandidateMetadata;
    [key: string]: unknown;
  };
}

export interface InspectionTarget {
  host: string;
  port: number;
  db_type: string;
  database?: string;
  credentials: {
    username: string;
    password: string;
  };
}

export interface InspectionRequest {
  targets: InspectionTarget[];
}

// Dashboard Types
export interface ServiceHealth {
  name: string;
  display_name?: string;
  status: "healthy" | "degraded" | "unhealthy" | "unknown";
  version: string | null;
  uptime_seconds: number | null;
  last_check: string;
  error_message: string | null;
}

export interface ServiceMetrics {
  cpu_percent: number | null;
  memory_mb: number | null;
  requests_per_minute: number | null;
  error_rate: number | null;
}

export interface ServiceInfo {
  health: ServiceHealth;
  metrics: ServiceMetrics | null;
}

export interface QueueInfo {
  name: string;
  messages: number;
  consumers: number;
  message_rate: number;
  state: "running" | "idle" | "blocked";
}

export interface RabbitMQMetrics {
  connected: boolean;
  queues: QueueInfo[];
  total_messages: number;
  total_consumers: number;
}

export interface EventMetrics {
  events_per_second: number;
  error_rate: number;
  events_today: number;
  events_last_hour: number;
}

export interface DashboardOverview {
  services: Record<string, ServiceInfo>;
  rabbitmq: RabbitMQMetrics;
  events: EventMetrics;
  last_updated: string;
}

// Profile Editor Types (extended)
export interface ProfileConfig {
  target_subnets: string[];
  port_ranges: {
    tcp: string;
    udp: string;
  };
  scan_rate_limit: number;
  max_services: number;
  max_hosts: number;
  timeout_seconds: number;
  disk_space_limit_mb: number;
  memory_limit_mb: number;
  enabled_collectors: string[];
  advanced_settings?: Record<string, unknown>;
}

export interface ConfigProfileFull {
  id: string;
  name: string;
  description: string | null;
  config: ProfileConfig;
  is_default: boolean;
  profile_type: "preset" | "custom";
  created_at: string;
  updated_at: string;
}

export interface CreateProfileInput {
  name: string;
  description?: string;
  config: ProfileConfig;
}

export interface UpdateProfileInput {
  name?: string;
  description?: string;
  config?: Partial<ProfileConfig>;
}

// Audit Trail Types
export interface TransmissionBatch {
  id: string;
  batch_number: number;
  status: "pending" | "transmitting" | "completed" | "failed";
  item_count: number;
  transmitted_at: string | null;
  response_code: number | null;
  error_message: string | null;
  created_at: string;
}

export interface TransmissionItem {
  id: string;
  batch_id: string;
  discovery_id: string;
  event_type: string;
  source_service: string;
  payload_hash: string;
  transmitted_at: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  action: string;
  actor: string;
  resource_type: string;
  resource_id: string;
  details: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
}

export interface AuditLogQueryParams {
  start_date?: string;
  end_date?: string;
  action?: string;
  actor?: string;
  resource_type?: string;
  limit?: number;
  offset?: number;
}

// Log Streaming Types
export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface LogStreamFilter {
  services?: string[];
  levels?: LogLevel[];
}
