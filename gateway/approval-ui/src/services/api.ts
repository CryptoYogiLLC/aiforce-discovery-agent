import type {
  Discovery,
  AuditLogEntry,
  PaginatedResult,
  DryrunSession,
  DryrunSessionSummary,
  DryrunDiscovery,
  DryrunContainer,
  ConfigProfileFull,
  CreateProfileInput,
  UpdateProfileInput,
  User,
  UserListResult,
  UserRole,
  CreateUserInput,
  UpdateUserInput,
  ScanRun,
  ScanCollector,
  ScanDiscovery,
  InspectionRequest,
  DashboardOverview,
  ServiceHealth,
  ServiceInfo,
  RabbitMQMetrics,
  EventMetrics,
  TransmissionBatch,
  TransmissionItem,
  AuditLog,
  AuditLogQueryParams,
} from "../types";

const API_BASE = "/api";

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export interface ListParams {
  page?: number;
  pageSize?: number;
  status?: string;
  sourceService?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export const api = {
  discoveries: {
    list: (params: ListParams = {}): Promise<PaginatedResult<Discovery>> => {
      const searchParams = new URLSearchParams();
      if (params.page) searchParams.set("page", String(params.page));
      if (params.pageSize)
        searchParams.set("pageSize", String(params.pageSize));
      if (params.status) searchParams.set("status", params.status);
      if (params.sourceService)
        searchParams.set("sourceService", params.sourceService);
      if (params.sortBy) searchParams.set("sortBy", params.sortBy);
      if (params.sortOrder) searchParams.set("sortOrder", params.sortOrder);

      return fetchJSON(`${API_BASE}/discoveries?${searchParams}`);
    },

    get: (id: string): Promise<Discovery> => {
      return fetchJSON(`${API_BASE}/discoveries/${id}`);
    },

    approve: (id: string, actor?: string): Promise<Discovery> => {
      return fetchJSON(`${API_BASE}/discoveries/${id}/approve`, {
        method: "POST",
        body: JSON.stringify({ actor }),
      });
    },

    reject: (
      id: string,
      reason: string,
      actor?: string,
    ): Promise<Discovery> => {
      return fetchJSON(`${API_BASE}/discoveries/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason, actor }),
      });
    },

    batchApprove: (
      ids: string[],
      actor?: string,
    ): Promise<{ approved: number; total: number }> => {
      return fetchJSON(`${API_BASE}/discoveries/batch/approve`, {
        method: "POST",
        body: JSON.stringify({ ids, actor }),
      });
    },
  },

  audit: {
    list: (
      params: { discoveryId?: string; page?: number; pageSize?: number } = {},
    ): Promise<PaginatedResult<AuditLogEntry>> => {
      const searchParams = new URLSearchParams();
      if (params.page) searchParams.set("page", String(params.page));
      if (params.pageSize)
        searchParams.set("pageSize", String(params.pageSize));
      if (params.discoveryId)
        searchParams.set("discoveryId", params.discoveryId);

      return fetchJSON(`${API_BASE}/audit?${searchParams}`);
    },

    getForDiscovery: (discoveryId: string): Promise<AuditLogEntry[]> => {
      return fetchJSON(`${API_BASE}/audit/discovery/${discoveryId}`);
    },
  },

  dryrun: {
    // Session management
    listSessions: (params?: {
      status?: string;
      limit?: number;
      offset?: number;
    }): Promise<{ sessions: DryrunSessionSummary[]; total: number }> => {
      const searchParams = new URLSearchParams();
      if (params?.status) searchParams.set("status", params.status);
      if (params?.limit) searchParams.set("limit", String(params.limit));
      if (params?.offset) searchParams.set("offset", String(params.offset));
      return fetchJSON(`${API_BASE}/dryrun/sessions?${searchParams}`);
    },

    getSession: async (id: string): Promise<DryrunSession> => {
      const response = await fetchJSON<{ session: DryrunSession }>(
        `${API_BASE}/dryrun/sessions/${id}`,
      );
      return response.session;
    },

    createSession: async (
      profileId: string,
      csrfToken?: string,
    ): Promise<DryrunSession> => {
      const response = await fetchJSON<{
        session: DryrunSession;
        message: string;
      }>(`${API_BASE}/dryrun/sessions`, {
        method: "POST",
        headers: csrfToken ? { "X-CSRF-Token": csrfToken } : undefined,
        body: JSON.stringify({ profile_id: profileId }),
      });
      return response.session;
    },

    startSession: async (
      id: string,
      csrfToken?: string,
    ): Promise<DryrunSession> => {
      const response = await fetchJSON<{
        session: DryrunSession;
        message: string;
      }>(`${API_BASE}/dryrun/sessions/${id}/start`, {
        method: "POST",
        headers: csrfToken ? { "X-CSRF-Token": csrfToken } : undefined,
      });
      return response.session;
    },

    stopSession: async (
      id: string,
      csrfToken?: string,
    ): Promise<DryrunSession> => {
      const response = await fetchJSON<{
        session: DryrunSession;
        message: string;
      }>(`${API_BASE}/dryrun/sessions/${id}/stop`, {
        method: "POST",
        headers: csrfToken ? { "X-CSRF-Token": csrfToken } : undefined,
      });
      return response.session;
    },

    // Discoveries
    getDiscoveries: (
      sessionId: string,
      params?: {
        source?: string;
        status?: string;
        limit?: number;
        offset?: number;
      },
    ): Promise<{ discoveries: DryrunDiscovery[]; total: number }> => {
      const searchParams = new URLSearchParams();
      if (params?.source) searchParams.set("source", params.source);
      if (params?.status) searchParams.set("status", params.status);
      if (params?.limit) searchParams.set("limit", String(params.limit));
      if (params?.offset) searchParams.set("offset", String(params.offset));
      return fetchJSON(
        `${API_BASE}/dryrun/sessions/${sessionId}/discoveries?${searchParams}`,
      );
    },

    reviewDiscovery: async (
      discoveryId: string,
      status: "approved" | "rejected",
      notes?: string,
      csrfToken?: string,
    ): Promise<DryrunDiscovery> => {
      const response = await fetchJSON<{ discovery: DryrunDiscovery }>(
        `${API_BASE}/dryrun/discoveries/${discoveryId}/review`,
        {
          method: "POST",
          headers: csrfToken ? { "X-CSRF-Token": csrfToken } : undefined,
          body: JSON.stringify({ status, notes }),
        },
      );
      return response.discovery;
    },

    // Containers
    getContainers: async (sessionId: string): Promise<DryrunContainer[]> => {
      const response = await fetchJSON<{ containers: DryrunContainer[] }>(
        `${API_BASE}/dryrun/sessions/${sessionId}/containers`,
      );
      return response.containers;
    },

    // Export
    exportSession: (sessionId: string): Promise<object> => {
      return fetchJSON(`${API_BASE}/dryrun/sessions/${sessionId}/export`);
    },
  },

  profiles: {
    list: async (params?: {
      profile_type?: string;
    }): Promise<ConfigProfileFull[]> => {
      const searchParams = new URLSearchParams();
      if (params?.profile_type)
        searchParams.set("profile_type", params.profile_type);
      const data = await fetchJSON<{ profiles: ConfigProfileFull[] }>(
        `${API_BASE}/profiles?${searchParams}`,
      );
      return data.profiles;
    },

    get: (id: string): Promise<ConfigProfileFull> => {
      return fetchJSON(`${API_BASE}/profiles/${id}`);
    },

    create: (
      data: CreateProfileInput,
      csrfToken: string,
    ): Promise<ConfigProfileFull> => {
      return fetchJSON(`${API_BASE}/profiles`, {
        method: "POST",
        headers: { "X-CSRF-Token": csrfToken },
        body: JSON.stringify(data),
      });
    },

    update: (
      id: string,
      data: UpdateProfileInput,
      csrfToken: string,
    ): Promise<ConfigProfileFull> => {
      return fetchJSON(`${API_BASE}/profiles/${id}`, {
        method: "PATCH",
        headers: { "X-CSRF-Token": csrfToken },
        body: JSON.stringify(data),
      });
    },

    clone: (
      id: string,
      name: string,
      csrfToken: string,
    ): Promise<ConfigProfileFull> => {
      return fetchJSON(`${API_BASE}/profiles/${id}/clone`, {
        method: "POST",
        headers: { "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ name }),
      });
    },

    delete: (id: string, csrfToken: string): Promise<{ message: string }> => {
      return fetchJSON(`${API_BASE}/profiles/${id}`, {
        method: "DELETE",
        headers: { "X-CSRF-Token": csrfToken },
      });
    },

    exportYaml: (id: string): Promise<{ yaml: string }> => {
      return fetchJSON(`${API_BASE}/profiles/${id}/export`);
    },

    importYaml: (
      yaml: string,
      csrfToken: string,
    ): Promise<ConfigProfileFull> => {
      return fetchJSON(`${API_BASE}/profiles/import`, {
        method: "POST",
        headers: { "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ yaml }),
      });
    },
  },

  users: {
    list: (params?: {
      page?: number;
      limit?: number;
      role?: UserRole;
      is_active?: boolean;
    }): Promise<UserListResult> => {
      const searchParams = new URLSearchParams();
      if (params?.page) searchParams.set("page", String(params.page));
      if (params?.limit) searchParams.set("limit", String(params.limit));
      if (params?.role) searchParams.set("role", params.role);
      if (params?.is_active !== undefined)
        searchParams.set("is_active", String(params.is_active));
      return fetchJSON(`${API_BASE}/users?${searchParams}`);
    },

    get: (id: string): Promise<User> => {
      return fetchJSON(`${API_BASE}/users/${id}`);
    },

    create: (data: CreateUserInput, csrfToken: string): Promise<User> => {
      return fetchJSON(`${API_BASE}/users`, {
        method: "POST",
        headers: { "X-CSRF-Token": csrfToken },
        body: JSON.stringify(data),
      });
    },

    update: (
      id: string,
      data: UpdateUserInput,
      csrfToken: string,
    ): Promise<User> => {
      return fetchJSON(`${API_BASE}/users/${id}`, {
        method: "PATCH",
        headers: { "X-CSRF-Token": csrfToken },
        body: JSON.stringify(data),
      });
    },

    deactivate: (
      id: string,
      csrfToken: string,
    ): Promise<{ message: string }> => {
      return fetchJSON(`${API_BASE}/users/${id}/deactivate`, {
        method: "POST",
        headers: { "X-CSRF-Token": csrfToken },
      });
    },

    reactivate: (
      id: string,
      csrfToken: string,
    ): Promise<{ message: string }> => {
      return fetchJSON(`${API_BASE}/users/${id}/reactivate`, {
        method: "POST",
        headers: { "X-CSRF-Token": csrfToken },
      });
    },

    resetPassword: (
      userId: string,
      csrfToken: string,
    ): Promise<{ recovery_code: string; expires_at: string }> => {
      return fetchJSON(`${API_BASE}/auth/reset-password`, {
        method: "POST",
        headers: { "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ user_id: userId }),
      });
    },
  },

  // Scan API (ADR-007)
  scans: {
    list: (params?: {
      status?: string;
      limit?: number;
      offset?: number;
    }): Promise<{ scans: ScanRun[]; total: number }> => {
      const searchParams = new URLSearchParams();
      if (params?.status) searchParams.set("status", params.status);
      if (params?.limit) searchParams.set("limit", String(params.limit));
      if (params?.offset) searchParams.set("offset", String(params.offset));
      return fetchJSON(`${API_BASE}/scans?${searchParams}`);
    },

    get: async (id: string): Promise<ScanRun> => {
      const response = await fetchJSON<{ scan: ScanRun }>(
        `${API_BASE}/scans/${id}`,
      );
      return response.scan;
    },

    create: async (profileId: string, csrfToken?: string): Promise<ScanRun> => {
      const response = await fetchJSON<{ scan: ScanRun; message: string }>(
        `${API_BASE}/scans`,
        {
          method: "POST",
          headers: csrfToken ? { "X-CSRF-Token": csrfToken } : undefined,
          body: JSON.stringify({ profile_id: profileId }),
        },
      );
      return response.scan;
    },

    start: async (id: string, csrfToken?: string): Promise<ScanRun> => {
      const response = await fetchJSON<{ scan: ScanRun; message: string }>(
        `${API_BASE}/scans/${id}/start`,
        {
          method: "POST",
          headers: csrfToken ? { "X-CSRF-Token": csrfToken } : undefined,
        },
      );
      return response.scan;
    },

    stop: async (id: string, csrfToken?: string): Promise<ScanRun> => {
      const response = await fetchJSON<{ scan: ScanRun; message: string }>(
        `${API_BASE}/scans/${id}/stop`,
        {
          method: "POST",
          headers: csrfToken ? { "X-CSRF-Token": csrfToken } : undefined,
        },
      );
      return response.scan;
    },

    getDiscoveries: (
      scanId: string,
      params?: {
        candidate?: boolean;
        status?: string;
        limit?: number;
        offset?: number;
      },
    ): Promise<{ discoveries: ScanDiscovery[]; total: number }> => {
      const searchParams = new URLSearchParams();
      if (params?.candidate !== undefined)
        searchParams.set("candidate", String(params.candidate));
      if (params?.status) searchParams.set("status", params.status);
      if (params?.limit) searchParams.set("limit", String(params.limit));
      if (params?.offset) searchParams.set("offset", String(params.offset));
      return fetchJSON(
        `${API_BASE}/scans/${scanId}/discoveries?${searchParams}`,
      );
    },

    getCollectors: async (scanId: string): Promise<ScanCollector[]> => {
      const response = await fetchJSON<{ collectors: ScanCollector[] }>(
        `${API_BASE}/scans/${scanId}/collectors`,
      );
      return response.collectors;
    },

    triggerInspection: async (
      scanId: string,
      request: InspectionRequest,
      csrfToken?: string,
    ): Promise<{ message: string }> => {
      return fetchJSON(`${API_BASE}/scans/${scanId}/inspect`, {
        method: "POST",
        headers: csrfToken ? { "X-CSRF-Token": csrfToken } : undefined,
        body: JSON.stringify(request),
      });
    },

    // SSE events endpoint URL (not a fetch, used for EventSource)
    getEventsUrl: (scanId: string): string => {
      return `${API_BASE}/scans/${scanId}/events`;
    },
  },

  // Dashboard API
  dashboard: {
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
  },

  // Audit Trail API
  auditTrail: {
    listTransmissions: (params?: {
      status?: string;
      limit?: number;
      offset?: number;
    }): Promise<{ batches: TransmissionBatch[]; total: number }> => {
      const searchParams = new URLSearchParams();
      if (params?.status) searchParams.set("status", params.status);
      if (params?.limit) searchParams.set("limit", String(params.limit));
      if (params?.offset) searchParams.set("offset", String(params.offset));
      return fetchJSON(`${API_BASE}/audit-trail/transmissions?${searchParams}`);
    },

    getBatch: (id: string): Promise<TransmissionBatch> => {
      return fetchJSON(`${API_BASE}/audit-trail/transmissions/${id}`);
    },

    getBatchItems: (
      id: string,
      params?: { limit?: number; offset?: number },
    ): Promise<{ items: TransmissionItem[]; total: number }> => {
      const searchParams = new URLSearchParams();
      if (params?.limit) searchParams.set("limit", String(params.limit));
      if (params?.offset) searchParams.set("offset", String(params.offset));
      return fetchJSON(
        `${API_BASE}/audit-trail/transmissions/${id}/items?${searchParams}`,
      );
    },

    getItemPayload: (
      id: string,
      reason?: string,
    ): Promise<{ payload: Record<string, unknown> }> => {
      const searchParams = new URLSearchParams();
      if (reason) searchParams.set("reason", reason);
      return fetchJSON(
        `${API_BASE}/audit-trail/items/${id}/payload?${searchParams}`,
      );
    },

    verifyItem: (
      id: string,
    ): Promise<{ verified: boolean; hash_match: boolean }> => {
      return fetchJSON(`${API_BASE}/audit-trail/items/${id}/verify`);
    },

    queryLogs: (
      params?: AuditLogQueryParams,
    ): Promise<{ logs: AuditLog[]; total: number }> => {
      const searchParams = new URLSearchParams();
      if (params?.start_date) searchParams.set("start_date", params.start_date);
      if (params?.end_date) searchParams.set("end_date", params.end_date);
      if (params?.action) searchParams.set("action", params.action);
      if (params?.actor) searchParams.set("actor", params.actor);
      if (params?.resource_type)
        searchParams.set("resource_type", params.resource_type);
      if (params?.limit) searchParams.set("limit", String(params.limit));
      if (params?.offset) searchParams.set("offset", String(params.offset));
      return fetchJSON(`${API_BASE}/audit-trail/logs?${searchParams}`);
    },

    export: async (params: {
      start_date: string;
      end_date: string;
      format?: "json" | "csv";
    }): Promise<Blob> => {
      const searchParams = new URLSearchParams();
      searchParams.set("start_date", params.start_date);
      searchParams.set("end_date", params.end_date);
      if (params.format) searchParams.set("format", params.format);

      const response = await fetch(
        `${API_BASE}/audit-trail/export?${searchParams}`,
        {
          credentials: "include",
        },
      );

      if (!response.ok) {
        throw new Error(`Export failed: HTTP ${response.status}`);
      }

      return response.blob();
    },
  },

  // Log Streaming API
  logs: {
    getStreamUrl: (): string => {
      return `${API_BASE}/logs/stream`;
    },
  },
};
