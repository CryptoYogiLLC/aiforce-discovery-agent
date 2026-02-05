import type {
  DashboardOverview,
  ServiceHealth,
  ServiceInfo,
  RabbitMQMetrics,
  EventMetrics,
} from "../../types";
import { API_BASE, fetchJSON } from "./utils";

// Dashboard API
export const dashboard = {
  getOverview: async (): Promise<DashboardOverview> => {
    // Backend returns different shapes than frontend types expect.
    // Transform here to bridge the gap.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await fetchJSON<any>(`${API_BASE}/dashboard`);

    // Transform services array → Record<string, ServiceInfo>
    const services: Record<string, ServiceInfo> = {};
    const rawServices = Array.isArray(raw.services) ? raw.services : [];
    for (const svc of rawServices) {
      const name = svc.health?.name || "unknown";
      // Map backend status (running/stopped/unhealthy/unknown) to frontend
      const statusMap: Record<string, string> = {
        running: "healthy",
        stopped: "unknown",
        unhealthy: "unhealthy",
        unknown: "unknown",
      };
      services[name] = {
        health: {
          name,
          display_name: svc.health?.display_name || undefined,
          status:
            (statusMap[svc.health?.status] as ServiceHealth["status"]) ||
            "unknown",
          version: svc.health?.version || null,
          uptime_seconds: svc.health?.uptime_seconds ?? null,
          last_check:
            svc.health?.last_check_at ||
            svc.health?.last_check ||
            new Date().toISOString(),
          error_message: svc.health?.error_message || null,
        },
        metrics: svc.metrics
          ? {
              cpu_percent: svc.metrics.cpu_percent ?? null,
              memory_mb: svc.metrics.memory_mb ?? null,
              requests_per_minute: svc.metrics.requests_per_minute ?? null,
              error_rate: svc.metrics.error_rate ?? null,
            }
          : null,
      };
    }

    // Transform RabbitMQ metrics
    const rawQueues = raw.rabbitmq?.queues || [];
    const rabbitmq: RabbitMQMetrics = {
      connected: (raw.rabbitmq?.connections ?? 0) > 0 || rawQueues.length > 0,
      queues: rawQueues.map(
        (q: {
          name: string;
          messages?: number;
          consumers?: number;
          message_rate?: number;
          status?: string;
        }) => ({
          name: q.name,
          messages: q.messages ?? 0,
          consumers: q.consumers ?? 0,
          message_rate: q.message_rate ?? 0,
          state:
            q.status === "healthy"
              ? "running"
              : q.status === "critical"
                ? "blocked"
                : "idle",
        }),
      ),
      total_messages: rawQueues.reduce(
        (
          sum: number,
          q: {
            messages?: number;
          },
        ) => sum + (q.messages ?? 0),
        0,
      ),
      total_consumers: rawQueues.reduce(
        (sum: number, q: { consumers?: number }) => sum + (q.consumers ?? 0),
        0,
      ),
    };

    // Transform event metrics
    const events: EventMetrics = {
      events_per_second: raw.events?.events_per_second ?? 0,
      error_rate: raw.events?.error_rate ?? 0,
      events_today: raw.events?.events_today ?? 0,
      events_last_hour: raw.events?.events_last_hour ?? 0,
    };

    return {
      services,
      rabbitmq,
      events,
      last_updated: raw.last_updated || new Date().toISOString(),
    };
  },

  getServices: (): Promise<Record<string, ServiceInfo>> => {
    return fetchJSON(`${API_BASE}/dashboard/services`);
  },

  getRabbitMQ: (): Promise<RabbitMQMetrics> => {
    return fetchJSON(`${API_BASE}/dashboard/rabbitmq`);
  },

  getEvents: (): Promise<EventMetrics> => {
    return fetchJSON(`${API_BASE}/dashboard/events`);
  },
};
