import type {
  TransmissionBatch,
  TransmissionItem,
  AuditLog,
  AuditLogQueryParams,
} from "../../types";
import { API_BASE, fetchJSON } from "./utils";

// Audit Trail API
export const auditTrail = {
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
};

// Log Streaming API
export const logs = {
  getStreamUrl: (): string => {
    return `${API_BASE}/logs/stream`;
  },
};
