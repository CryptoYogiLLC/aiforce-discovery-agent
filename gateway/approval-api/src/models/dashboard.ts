/**
 * Dashboard models for services monitoring
 * Reference: GitHub Issue #58
 */

export type ServiceStatus = "running" | "stopped" | "unhealthy" | "unknown";

export interface ServiceHealth {
  name: string;
  display_name: string;
  status: ServiceStatus;
  health_endpoint: string;
  uptime_seconds: number | null;
  last_check_at: Date;
  error_message: string | null;
}

export interface ServiceMetrics {
  name: string;
  cpu_percent: number | null;
  memory_mb: number | null;
  memory_limit_mb: number | null;
  memory_percent: number | null;
}

export interface ServiceInfo {
  health: ServiceHealth;
  metrics: ServiceMetrics;
}

export interface EventMetrics {
  events_per_second: number;
  events_today: number;
  error_rate: number;
  avg_latency_ms: number;
}

export interface QueueInfo {
  name: string;
  messages: number;
  consumers: number;
  status: "healthy" | "warning" | "critical";
  is_dlq: boolean;
}

export interface RabbitMQMetrics {
  queues: QueueInfo[];
  connections: number;
  channels: number;
}

export interface DashboardOverview {
  services: ServiceInfo[];
  events: EventMetrics;
  rabbitmq: RabbitMQMetrics;
  last_updated: Date;
}

export interface LogEntry {
  timestamp: Date;
  level: "DEBUG" | "INFO" | "WARN" | "ERROR";
  message: string;
  service: string;
  metadata?: Record<string, unknown>;
}

export interface LogFilter {
  service: string;
  level?: "DEBUG" | "INFO" | "WARN" | "ERROR";
  search?: string;
  limit?: number;
  since?: Date;
}

// Service registry with endpoints
export interface ServiceDefinition {
  name: string;
  display_name: string;
  health_endpoint: string;
  metrics_endpoint?: string;
  port: number;
  host: string;
}

// Default service definitions
export const SERVICES: ServiceDefinition[] = [
  {
    name: "approval-api",
    display_name: "Approval API",
    health_endpoint: "/health",
    metrics_endpoint: "/metrics",
    port: 3001,
    host: "approval-api",
  },
  {
    name: "network-scanner",
    display_name: "Network Scanner",
    health_endpoint: "/health",
    metrics_endpoint: "/metrics",
    port: 8001,
    host: "network-scanner",
  },
  {
    name: "code-analyzer",
    display_name: "Code Analyzer",
    health_endpoint: "/health",
    metrics_endpoint: "/metrics",
    port: 8002,
    host: "code-analyzer",
  },
  {
    name: "db-inspector",
    display_name: "DB Inspector",
    health_endpoint: "/health",
    metrics_endpoint: "/metrics",
    port: 8003,
    host: "db-inspector",
  },
  {
    name: "enrichment",
    display_name: "Enrichment Service",
    health_endpoint: "/health",
    metrics_endpoint: "/metrics",
    port: 8010,
    host: "enrichment",
  },
  {
    name: "pii-redactor",
    display_name: "PII Redactor",
    health_endpoint: "/health",
    metrics_endpoint: "/metrics",
    port: 8011,
    host: "pii-redactor",
  },
  {
    name: "scoring",
    display_name: "Scoring Service",
    health_endpoint: "/health",
    metrics_endpoint: "/metrics",
    port: 8012,
    host: "scoring",
  },
  {
    name: "transmitter",
    display_name: "Transmitter",
    health_endpoint: "/health",
    metrics_endpoint: "/metrics",
    port: 8020,
    host: "transmitter",
  },
];

// Queue thresholds for status
export const QUEUE_THRESHOLDS = {
  warning: 100,
  critical: 1000,
};

// DLQ threshold - any messages is a warning
export const DLQ_THRESHOLD = 1;
