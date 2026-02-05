import type { Discovery, AuditLogEntry, PaginatedResult } from "../../types";
import { API_BASE, fetchJSON } from "./utils";
import type { ListParams } from "./utils";

export const discoveries = {
  list: (params: ListParams = {}): Promise<PaginatedResult<Discovery>> => {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set("page", String(params.page));
    if (params.pageSize) searchParams.set("pageSize", String(params.pageSize));
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

  reject: (id: string, reason: string, actor?: string): Promise<Discovery> => {
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
};

export const audit = {
  list: (
    params: { discoveryId?: string; page?: number; pageSize?: number } = {},
  ): Promise<PaginatedResult<AuditLogEntry>> => {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set("page", String(params.page));
    if (params.pageSize) searchParams.set("pageSize", String(params.pageSize));
    if (params.discoveryId) searchParams.set("discoveryId", params.discoveryId);

    return fetchJSON(`${API_BASE}/audit?${searchParams}`);
  },

  getForDiscovery: (discoveryId: string): Promise<AuditLogEntry[]> => {
    return fetchJSON(`${API_BASE}/audit/discovery/${discoveryId}`);
  },
};
