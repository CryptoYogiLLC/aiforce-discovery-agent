import type {
  ConfigProfileFull,
  CreateProfileInput,
  UpdateProfileInput,
} from "../../types";

export const API_BASE = "/api";

/**
 * Backend returns flat profile objects; frontend expects nested config object.
 * This transforms the flat backend shape into ConfigProfileFull.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapBackendProfile(raw: any): ConfigProfileFull {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description || null,
    profile_type: raw.profile_type || "custom",
    is_default: raw.is_default || false,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    config: {
      target_subnets: raw.target_subnets || [],
      port_ranges: raw.port_ranges || { tcp: "", udp: "" },
      scan_rate_limit: raw.scan_rate_limit ?? 0,
      max_services: raw.max_services ?? 0,
      max_hosts: raw.max_hosts ?? 0,
      timeout_seconds: raw.timeout_seconds ?? 0,
      disk_space_limit_mb: raw.disk_space_limit_mb ?? 0,
      memory_limit_mb: raw.memory_limit_mb ?? 0,
      enabled_collectors: raw.enabled_collectors || [],
      advanced_settings: raw.advanced_settings || undefined,
    },
  };
}

/**
 * Flatten nested CreateProfileInput for the backend API.
 */
export function flattenCreateInput(
  data: CreateProfileInput,
): Record<string, unknown> {
  return {
    name: data.name,
    description: data.description,
    ...(data.config && {
      target_subnets: data.config.target_subnets,
      port_ranges: data.config.port_ranges,
      scan_rate_limit: data.config.scan_rate_limit,
      max_services: data.config.max_services,
      max_hosts: data.config.max_hosts,
      timeout_seconds: data.config.timeout_seconds,
      disk_space_limit_mb: data.config.disk_space_limit_mb,
      memory_limit_mb: data.config.memory_limit_mb,
      enabled_collectors: data.config.enabled_collectors,
      advanced_settings: data.config.advanced_settings,
    }),
  };
}

/**
 * Flatten nested UpdateProfileInput for the backend API.
 */
export function flattenUpdateInput(
  data: UpdateProfileInput,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (data.name !== undefined) result.name = data.name;
  if (data.description !== undefined) result.description = data.description;
  if (data.config) {
    if (data.config.target_subnets !== undefined)
      result.target_subnets = data.config.target_subnets;
    if (data.config.port_ranges !== undefined)
      result.port_ranges = data.config.port_ranges;
    if (data.config.scan_rate_limit !== undefined)
      result.scan_rate_limit = data.config.scan_rate_limit;
    if (data.config.max_services !== undefined)
      result.max_services = data.config.max_services;
    if (data.config.max_hosts !== undefined)
      result.max_hosts = data.config.max_hosts;
    if (data.config.timeout_seconds !== undefined)
      result.timeout_seconds = data.config.timeout_seconds;
    if (data.config.disk_space_limit_mb !== undefined)
      result.disk_space_limit_mb = data.config.disk_space_limit_mb;
    if (data.config.memory_limit_mb !== undefined)
      result.memory_limit_mb = data.config.memory_limit_mb;
    if (data.config.enabled_collectors !== undefined)
      result.enabled_collectors = data.config.enabled_collectors;
    if (data.config.advanced_settings !== undefined)
      result.advanced_settings = data.config.advanced_settings;
  }
  return result;
}

export async function fetchJSON<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    // Backend uses both { error: "..." } and { errors: [{ message }] } formats
    const message =
      body.error ||
      (Array.isArray(body.errors)
        ? body.errors.map((e: { message?: string }) => e.message).join("; ")
        : null) ||
      `HTTP ${response.status}`;
    throw new Error(message);
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
