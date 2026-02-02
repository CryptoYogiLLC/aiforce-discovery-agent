/**
 * Dashboard service for collecting metrics from services
 * Reference: GitHub Issue #58
 *
 * Collects metrics from:
 * - Service health endpoints (/health)
 * - RabbitMQ Management API
 * - Container stats (optional, requires Docker socket)
 */

import {
  ServiceHealth,
  ServiceMetrics,
  ServiceInfo,
  EventMetrics,
  QueueInfo,
  RabbitMQMetrics,
  DashboardOverview,
  SERVICES,
  ServiceDefinition,
  QUEUE_THRESHOLDS,
  DLQ_THRESHOLD,
} from "../models/dashboard";
import { logger } from "./logger";

// RabbitMQ Management API config
const RABBITMQ_MGMT_URL =
  process.env.RABBITMQ_MGMT_URL || "http://rabbitmq:15672";
const RABBITMQ_USER = process.env.RABBITMQ_USER || "guest";
const RABBITMQ_PASS = process.env.RABBITMQ_PASS || "guest";

// Docker stats API (optional)
const DOCKER_STATS_URL = process.env.DOCKER_STATS_URL || null;

// Timeout for health checks
const HEALTH_CHECK_TIMEOUT = 5000;

/**
 * Check health of a single service
 */
async function checkServiceHealth(
  service: ServiceDefinition,
): Promise<ServiceHealth> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);

  try {
    const response = await fetch(
      `http://${service.host}:${service.port}${service.health_endpoint}`,
      { signal: controller.signal },
    );

    if (response.ok) {
      const data = (await response.json()) as { uptime?: number };
      return {
        name: service.name,
        display_name: service.display_name,
        status: "running",
        health_endpoint: `http://${service.host}:${service.port}${service.health_endpoint}`,
        uptime_seconds: data.uptime || null,
        last_check_at: new Date(),
        error_message: null,
      };
    } else {
      return {
        name: service.name,
        display_name: service.display_name,
        status: "unhealthy",
        health_endpoint: `http://${service.host}:${service.port}${service.health_endpoint}`,
        uptime_seconds: null,
        last_check_at: new Date(),
        error_message: `HTTP ${response.status}`,
      };
    }
  } catch (err) {
    const error = err as Error;
    const status = error.name === "AbortError" ? "unhealthy" : "stopped";

    return {
      name: service.name,
      display_name: service.display_name,
      status,
      health_endpoint: `http://${service.host}:${service.port}${service.health_endpoint}`,
      uptime_seconds: null,
      last_check_at: new Date(),
      error_message: error.message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Get metrics for a single service (container stats)
 */
async function getServiceMetrics(
  service: ServiceDefinition,
): Promise<ServiceMetrics> {
  // If Docker stats API is available, use it
  if (DOCKER_STATS_URL) {
    try {
      const response = await fetch(
        `${DOCKER_STATS_URL}/containers/${service.name}/stats?stream=false`,
      );

      if (response.ok) {
        const stats = (await response.json()) as {
          cpu_stats: {
            cpu_usage: { total_usage: number };
            system_cpu_usage: number;
          };
          precpu_stats: {
            cpu_usage: { total_usage: number };
            system_cpu_usage: number;
          };
          memory_stats: { usage: number; limit: number };
        };

        // Calculate CPU percentage
        const cpuDelta =
          stats.cpu_stats.cpu_usage.total_usage -
          stats.precpu_stats.cpu_usage.total_usage;
        const systemDelta =
          stats.cpu_stats.system_cpu_usage -
          stats.precpu_stats.system_cpu_usage;
        const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * 100 : 0;

        // Memory in MB
        const memoryMb = stats.memory_stats.usage / 1024 / 1024;
        const memoryLimitMb = stats.memory_stats.limit / 1024 / 1024;

        return {
          name: service.name,
          cpu_percent: Math.round(cpuPercent * 100) / 100,
          memory_mb: Math.round(memoryMb),
          memory_limit_mb: Math.round(memoryLimitMb),
          memory_percent:
            Math.round((memoryMb / memoryLimitMb) * 100 * 100) / 100,
        };
      }
    } catch (err) {
      logger.debug("Failed to get Docker stats", {
        service: service.name,
        error: (err as Error).message,
      });
    }
  }

  // Return null metrics if Docker stats not available
  return {
    name: service.name,
    cpu_percent: null,
    memory_mb: null,
    memory_limit_mb: null,
    memory_percent: null,
  };
}

/**
 * Get RabbitMQ queue information
 */
async function getRabbitMQQueues(): Promise<QueueInfo[]> {
  try {
    const auth = Buffer.from(`${RABBITMQ_USER}:${RABBITMQ_PASS}`).toString(
      "base64",
    );

    const response = await fetch(`${RABBITMQ_MGMT_URL}/api/queues`, {
      headers: {
        Authorization: `Basic ${auth}`,
      },
    });

    if (!response.ok) {
      throw new Error(`RabbitMQ API returned ${response.status}`);
    }

    const queues = (await response.json()) as Array<{
      name: string;
      messages: number;
      consumers: number;
    }>;

    return queues.map((q) => {
      const isDlq = q.name.startsWith("dlq.");
      let status: "healthy" | "warning" | "critical" = "healthy";

      if (isDlq && q.messages >= DLQ_THRESHOLD) {
        status = "critical";
      } else if (q.messages >= QUEUE_THRESHOLDS.critical) {
        status = "critical";
      } else if (q.messages >= QUEUE_THRESHOLDS.warning) {
        status = "warning";
      }

      return {
        name: q.name,
        messages: q.messages,
        consumers: q.consumers,
        status,
        is_dlq: isDlq,
      };
    });
  } catch (err) {
    logger.error("Failed to get RabbitMQ queues", {
      error: (err as Error).message,
    });
    return [];
  }
}

/**
 * Get RabbitMQ connection/channel counts
 */
async function getRabbitMQOverview(): Promise<{
  connections: number;
  channels: number;
}> {
  try {
    const auth = Buffer.from(`${RABBITMQ_USER}:${RABBITMQ_PASS}`).toString(
      "base64",
    );

    const response = await fetch(`${RABBITMQ_MGMT_URL}/api/overview`, {
      headers: {
        Authorization: `Basic ${auth}`,
      },
    });

    if (!response.ok) {
      throw new Error(`RabbitMQ API returned ${response.status}`);
    }

    const overview = (await response.json()) as {
      object_totals: { connections: number; channels: number };
    };

    return {
      connections: overview.object_totals.connections,
      channels: overview.object_totals.channels,
    };
  } catch (err) {
    logger.error("Failed to get RabbitMQ overview", {
      error: (err as Error).message,
    });
    return { connections: 0, channels: 0 };
  }
}

/**
 * Get event metrics (from RabbitMQ message rates)
 */
async function getEventMetrics(): Promise<EventMetrics> {
  try {
    const auth = Buffer.from(`${RABBITMQ_USER}:${RABBITMQ_PASS}`).toString(
      "base64",
    );

    const response = await fetch(`${RABBITMQ_MGMT_URL}/api/overview`, {
      headers: {
        Authorization: `Basic ${auth}`,
      },
    });

    if (!response.ok) {
      throw new Error(`RabbitMQ API returned ${response.status}`);
    }

    const overview = (await response.json()) as {
      message_stats?: {
        publish_details?: { rate: number };
        deliver_details?: { rate: number };
        publish?: number;
      };
      queue_totals?: {
        messages: number;
      };
    };

    const publishRate = overview.message_stats?.publish_details?.rate || 0;
    const deliverRate = overview.message_stats?.deliver_details?.rate || 0;
    const totalMessages = overview.message_stats?.publish || 0;

    // Estimate error rate from DLQ messages
    const queues = await getRabbitMQQueues();
    const dlqMessages = queues
      .filter((q) => q.is_dlq)
      .reduce((sum, q) => sum + q.messages, 0);
    const errorRate =
      totalMessages > 0
        ? Math.round((dlqMessages / totalMessages) * 100 * 100) / 100
        : 0;

    return {
      events_per_second: Math.round((publishRate + deliverRate) * 100) / 100,
      events_today: totalMessages, // This is cumulative, not daily
      error_rate: errorRate,
      avg_latency_ms: 0, // Would need service-level metrics
    };
  } catch (err) {
    logger.error("Failed to get event metrics", {
      error: (err as Error).message,
    });
    return {
      events_per_second: 0,
      events_today: 0,
      error_rate: 0,
      avg_latency_ms: 0,
    };
  }
}

/**
 * Get complete dashboard overview
 */
export async function getDashboardOverview(): Promise<DashboardOverview> {
  // Collect health and metrics for all services in parallel
  const servicePromises = SERVICES.map(async (service) => {
    const [health, metrics] = await Promise.all([
      checkServiceHealth(service),
      getServiceMetrics(service),
    ]);
    return { health, metrics } as ServiceInfo;
  });

  const services = await Promise.all(servicePromises);

  // Get RabbitMQ metrics
  const [queues, overview, events] = await Promise.all([
    getRabbitMQQueues(),
    getRabbitMQOverview(),
    getEventMetrics(),
  ]);

  return {
    services,
    events,
    rabbitmq: {
      queues,
      connections: overview.connections,
      channels: overview.channels,
    },
    last_updated: new Date(),
  };
}

/**
 * Get health status for a specific service
 */
export async function getServiceHealthStatus(
  serviceName: string,
): Promise<ServiceHealth | null> {
  const service = SERVICES.find((s) => s.name === serviceName);
  if (!service) {
    return null;
  }
  return checkServiceHealth(service);
}

/**
 * Get all services list (for reference)
 */
export function getServicesList(): ServiceDefinition[] {
  return SERVICES;
}

/**
 * Get RabbitMQ metrics only
 */
export async function getRabbitMQMetrics(): Promise<RabbitMQMetrics> {
  const [queues, overview] = await Promise.all([
    getRabbitMQQueues(),
    getRabbitMQOverview(),
  ]);

  return {
    queues,
    connections: overview.connections,
    channels: overview.channels,
  };
}
