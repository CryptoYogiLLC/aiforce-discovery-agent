import type {
  ScanRun,
  ScanCollector,
  ScanDiscovery,
  InspectionRequest,
} from "../../types";
import { API_BASE, fetchJSON } from "./utils";

// Scan API (ADR-007)
export const scans = {
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
    return fetchJSON(`${API_BASE}/scans/${scanId}/discoveries?${searchParams}`);
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
};
