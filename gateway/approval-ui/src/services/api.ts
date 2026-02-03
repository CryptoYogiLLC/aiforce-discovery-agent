import type {
  Discovery,
  AuditLogEntry,
  PaginatedResult,
  DryrunSession,
  DryrunSessionSummary,
  DryrunDiscovery,
  DryrunContainer,
  ConfigProfile,
} from "../types";

const API_BASE = "/api";

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
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

    getSession: (id: string): Promise<DryrunSession> => {
      return fetchJSON(`${API_BASE}/dryrun/sessions/${id}`);
    },

    createSession: (profileId: string): Promise<DryrunSession> => {
      return fetchJSON(`${API_BASE}/dryrun/sessions`, {
        method: "POST",
        body: JSON.stringify({ profile_id: profileId }),
      });
    },

    startSession: (id: string): Promise<DryrunSession> => {
      return fetchJSON(`${API_BASE}/dryrun/sessions/${id}/start`, {
        method: "POST",
      });
    },

    stopSession: (id: string): Promise<DryrunSession> => {
      return fetchJSON(`${API_BASE}/dryrun/sessions/${id}/stop`, {
        method: "POST",
      });
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

    reviewDiscovery: (
      discoveryId: string,
      status: "approved" | "rejected",
      notes?: string,
    ): Promise<DryrunDiscovery> => {
      return fetchJSON(`${API_BASE}/dryrun/discoveries/${discoveryId}/review`, {
        method: "POST",
        body: JSON.stringify({ status, notes }),
      });
    },

    // Containers
    getContainers: (sessionId: string): Promise<DryrunContainer[]> => {
      return fetchJSON(`${API_BASE}/dryrun/sessions/${sessionId}/containers`);
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
};
