import type {
  Discovery,
  AuditLogEntry,
  PaginatedResult,
  DryrunSession,
  DryrunSessionSummary,
  DryrunDiscovery,
  DryrunContainer,
  ConfigProfile,
  User,
  UserListResult,
  UserRole,
  CreateUserInput,
  UpdateUserInput,
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
    list: async (): Promise<ConfigProfile[]> => {
      const data = await fetchJSON<{ profiles: ConfigProfile[] }>(
        `${API_BASE}/profiles`,
      );
      return data.profiles;
    },

    get: (id: string): Promise<ConfigProfile> => {
      return fetchJSON(`${API_BASE}/profiles/${id}`);
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
};
