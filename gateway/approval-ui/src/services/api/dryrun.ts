import type {
  DryrunSession,
  DryrunSessionSummary,
  DryrunDiscovery,
  DryrunContainer,
} from "../../types";
import { API_BASE, fetchJSON } from "./utils";

export const dryrun = {
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
};
