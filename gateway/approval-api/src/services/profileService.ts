/**
 * Configuration Profile service
 * Reference: ADR-005 Configuration Propagation Model, GitHub Issue #56
 */

import { pool } from "./database";
import {
  ConfigProfile,
  CreateProfileInput,
  UpdateProfileInput,
  ScanConfig,
  rowToProfile,
  rowToScanConfig,
  validateProfile,
  validateCrossField,
  ValidationError,
} from "../models/profile";
import { logger } from "./logger";

/**
 * List all profiles with optional filtering
 */
export async function listProfiles(filters?: {
  profile_type?: "preset" | "custom";
  created_by?: string;
}): Promise<ConfigProfile[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters?.profile_type) {
    conditions.push(`profile_type = $${paramIndex++}`);
    params.push(filters.profile_type);
  }

  if (filters?.created_by) {
    conditions.push(`created_by = $${paramIndex++}`);
    params.push(filters.created_by);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await pool.query(
    `SELECT * FROM gateway.config_profiles ${whereClause}
     ORDER BY profile_type DESC, name ASC`,
    params,
  );

  return result.rows.map((row) => rowToProfile(row as Record<string, unknown>));
}

/**
 * Get profile by ID
 */
export async function getProfileById(
  id: string,
): Promise<ConfigProfile | null> {
  const result = await pool.query(
    "SELECT * FROM gateway.config_profiles WHERE id = $1",
    [id],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return rowToProfile(result.rows[0] as Record<string, unknown>);
}

/**
 * Get profile by name
 */
export async function getProfileByName(
  name: string,
): Promise<ConfigProfile | null> {
  const result = await pool.query(
    "SELECT * FROM gateway.config_profiles WHERE name = $1",
    [name],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return rowToProfile(result.rows[0] as Record<string, unknown>);
}

/**
 * Create a new custom profile
 */
export async function createProfile(
  input: CreateProfileInput,
  createdBy: string,
): Promise<{ profile?: ConfigProfile; errors?: ValidationError[] }> {
  // Validate input
  const validationErrors = validateProfile(input);
  const crossFieldErrors = validateCrossField(input);
  const allErrors = [...validationErrors, ...crossFieldErrors];

  if (allErrors.length > 0) {
    return { errors: allErrors };
  }

  // Check for duplicate name
  const existing = await getProfileByName(input.name);
  if (existing) {
    return {
      errors: [{ field: "name", message: "Profile name already exists" }],
    };
  }

  const result = await pool.query(
    `INSERT INTO gateway.config_profiles (
      name, description, profile_type,
      target_subnets, port_ranges, scan_rate_limit,
      max_services, max_hosts, timeout_seconds,
      disk_space_limit_mb, memory_limit_mb,
      enabled_collectors, advanced_settings,
      created_by
    ) VALUES ($1, $2, 'custom', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *`,
    [
      input.name,
      input.description || null,
      JSON.stringify(
        input.target_subnets || [
          "10.0.0.0/8",
          "172.16.0.0/12",
          "192.168.0.0/16",
        ],
      ),
      JSON.stringify(
        input.port_ranges || {
          tcp: "1-1024,3306,5432,6379,8080,8443",
          udp: "53,161,500",
        },
      ),
      input.scan_rate_limit ?? 100,
      input.max_services ?? 1000,
      input.max_hosts ?? 500,
      input.timeout_seconds ?? 30,
      input.disk_space_limit_mb ?? 10240,
      input.memory_limit_mb ?? 512,
      JSON.stringify(
        input.enabled_collectors || [
          "network-scanner",
          "code-analyzer",
          "db-inspector",
        ],
      ),
      JSON.stringify(input.advanced_settings || {}),
      createdBy,
    ],
  );

  const profile = rowToProfile(result.rows[0] as Record<string, unknown>);
  logger.info("Profile created", { profileId: profile.id, name: profile.name });

  return { profile };
}

/**
 * Clone a preset profile to create a custom one
 */
export async function cloneProfile(
  sourceId: string,
  newName: string,
  createdBy: string,
): Promise<{ profile?: ConfigProfile; errors?: ValidationError[] }> {
  const source = await getProfileById(sourceId);

  if (!source) {
    return {
      errors: [{ field: "sourceId", message: "Source profile not found" }],
    };
  }

  // Check for duplicate name
  const existing = await getProfileByName(newName);
  if (existing) {
    return {
      errors: [{ field: "name", message: "Profile name already exists" }],
    };
  }

  const result = await pool.query(
    `INSERT INTO gateway.config_profiles (
      name, description, profile_type,
      target_subnets, port_ranges, scan_rate_limit,
      max_services, max_hosts, timeout_seconds,
      disk_space_limit_mb, memory_limit_mb,
      enabled_collectors, advanced_settings,
      created_by
    ) VALUES ($1, $2, 'custom', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *`,
    [
      newName,
      `Cloned from ${source.name}`,
      JSON.stringify(source.target_subnets),
      JSON.stringify(source.port_ranges),
      source.scan_rate_limit,
      source.max_services,
      source.max_hosts,
      source.timeout_seconds,
      source.disk_space_limit_mb,
      source.memory_limit_mb,
      JSON.stringify(source.enabled_collectors),
      JSON.stringify(source.advanced_settings),
      createdBy,
    ],
  );

  const profile = rowToProfile(result.rows[0] as Record<string, unknown>);
  logger.info("Profile cloned", {
    sourceId,
    newProfileId: profile.id,
    name: profile.name,
  });

  return { profile };
}

/**
 * Update a custom profile (preset profiles cannot be updated)
 */
export async function updateProfile(
  id: string,
  input: UpdateProfileInput,
): Promise<{ profile?: ConfigProfile; errors?: ValidationError[] }> {
  // Check if profile exists and is custom
  const existing = await getProfileById(id);
  if (!existing) {
    return { errors: [{ field: "id", message: "Profile not found" }] };
  }

  if (existing.profile_type === "preset") {
    return {
      errors: [
        {
          field: "id",
          message: "Cannot modify preset profiles. Clone to customize.",
        },
      ],
    };
  }

  // Validate input
  const validationErrors = validateProfile(input);
  const crossFieldErrors = validateCrossField(input);
  const allErrors = [...validationErrors, ...crossFieldErrors];

  if (allErrors.length > 0) {
    return { errors: allErrors };
  }

  // Check for duplicate name if changing
  if (input.name && input.name !== existing.name) {
    const duplicate = await getProfileByName(input.name);
    if (duplicate) {
      return {
        errors: [{ field: "name", message: "Profile name already exists" }],
      };
    }
  }

  // Build dynamic update query
  const updates: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (input.name !== undefined) {
    updates.push(`name = $${paramIndex++}`);
    params.push(input.name);
  }

  if (input.description !== undefined) {
    updates.push(`description = $${paramIndex++}`);
    params.push(input.description);
  }

  if (input.target_subnets !== undefined) {
    updates.push(`target_subnets = $${paramIndex++}`);
    params.push(JSON.stringify(input.target_subnets));
  }

  if (input.port_ranges !== undefined) {
    updates.push(`port_ranges = $${paramIndex++}`);
    params.push(JSON.stringify(input.port_ranges));
  }

  if (input.scan_rate_limit !== undefined) {
    updates.push(`scan_rate_limit = $${paramIndex++}`);
    params.push(input.scan_rate_limit);
  }

  if (input.max_services !== undefined) {
    updates.push(`max_services = $${paramIndex++}`);
    params.push(input.max_services);
  }

  if (input.max_hosts !== undefined) {
    updates.push(`max_hosts = $${paramIndex++}`);
    params.push(input.max_hosts);
  }

  if (input.timeout_seconds !== undefined) {
    updates.push(`timeout_seconds = $${paramIndex++}`);
    params.push(input.timeout_seconds);
  }

  if (input.disk_space_limit_mb !== undefined) {
    updates.push(`disk_space_limit_mb = $${paramIndex++}`);
    params.push(input.disk_space_limit_mb);
  }

  if (input.memory_limit_mb !== undefined) {
    updates.push(`memory_limit_mb = $${paramIndex++}`);
    params.push(input.memory_limit_mb);
  }

  if (input.enabled_collectors !== undefined) {
    updates.push(`enabled_collectors = $${paramIndex++}`);
    params.push(JSON.stringify(input.enabled_collectors));
  }

  if (input.advanced_settings !== undefined) {
    updates.push(`advanced_settings = $${paramIndex++}`);
    params.push(JSON.stringify(input.advanced_settings));
  }

  if (updates.length === 0) {
    return { profile: existing };
  }

  params.push(id);
  const result = await pool.query(
    `UPDATE gateway.config_profiles SET ${updates.join(", ")}
     WHERE id = $${paramIndex}
     RETURNING *`,
    params,
  );

  const profile = rowToProfile(result.rows[0] as Record<string, unknown>);
  logger.info("Profile updated", { profileId: profile.id, updates: input });

  return { profile };
}

/**
 * Delete a custom profile (preset profiles cannot be deleted)
 */
export async function deleteProfile(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const existing = await getProfileById(id);
  if (!existing) {
    return { success: false, error: "Profile not found" };
  }

  if (existing.profile_type === "preset") {
    return { success: false, error: "Cannot delete preset profiles" };
  }

  await pool.query("DELETE FROM gateway.config_profiles WHERE id = $1", [id]);
  logger.info("Profile deleted", { profileId: id, name: existing.name });

  return { success: true };
}

/**
 * Record a scan configuration (snapshot of profile used)
 */
export async function recordScanConfig(
  scanId: string,
  profileId: string,
  startedBy: string,
): Promise<ScanConfig> {
  const profile = await getProfileById(profileId);
  if (!profile) {
    throw new Error("Profile not found");
  }

  const result = await pool.query(
    `INSERT INTO gateway.scan_configs (scan_id, profile_id, config_snapshot, started_by)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [scanId, profileId, JSON.stringify(profile), startedBy],
  );

  logger.info("Scan config recorded", { scanId, profileId, startedBy });
  return rowToScanConfig(result.rows[0] as Record<string, unknown>);
}

/**
 * Get scan configuration by scan ID
 */
export async function getScanConfig(
  scanId: string,
): Promise<ScanConfig | null> {
  const result = await pool.query(
    "SELECT * FROM gateway.scan_configs WHERE scan_id = $1",
    [scanId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return rowToScanConfig(result.rows[0] as Record<string, unknown>);
}

/**
 * Export profile as YAML-compatible object
 */
export function exportProfileAsYaml(profile: ConfigProfile): object {
  return {
    version: "1.0",
    profile: {
      name: profile.name,
      description: profile.description,
      network: {
        target_subnets: profile.target_subnets,
        port_ranges: profile.port_ranges,
        scan_rate_limit: profile.scan_rate_limit,
      },
      limits: {
        max_services: profile.max_services,
        max_hosts: profile.max_hosts,
        timeout_seconds: profile.timeout_seconds,
      },
      resources: {
        disk_space_limit_mb: profile.disk_space_limit_mb,
        memory_limit_mb: profile.memory_limit_mb,
      },
      collectors: profile.enabled_collectors,
      advanced: profile.advanced_settings,
    },
  };
}

/**
 * Import profile from YAML-compatible object
 */
export function parseYamlImport(data: unknown): {
  input?: CreateProfileInput;
  errors?: ValidationError[];
} {
  // Safe parsing - no arbitrary object construction
  if (typeof data !== "object" || data === null) {
    return { errors: [{ field: "data", message: "Invalid YAML structure" }] };
  }

  const obj = data as Record<string, unknown>;

  // Version check
  if (obj.version !== "1.0") {
    return {
      errors: [
        { field: "version", message: "Unsupported YAML version. Expected 1.0" },
      ],
    };
  }

  const profile = obj.profile as Record<string, unknown>;
  if (!profile) {
    return {
      errors: [{ field: "profile", message: "Missing profile section" }],
    };
  }

  const network = profile.network as Record<string, unknown> | undefined;
  const limits = profile.limits as Record<string, unknown> | undefined;
  const resources = profile.resources as Record<string, unknown> | undefined;

  const input: CreateProfileInput = {
    name: profile.name as string,
    description: profile.description as string | undefined,
    target_subnets: network?.target_subnets as string[] | undefined,
    port_ranges: network?.port_ranges as
      | { tcp: string; udp: string }
      | undefined,
    scan_rate_limit: network?.scan_rate_limit as number | undefined,
    max_services: limits?.max_services as number | undefined,
    max_hosts: limits?.max_hosts as number | undefined,
    timeout_seconds: limits?.timeout_seconds as number | undefined,
    disk_space_limit_mb: resources?.disk_space_limit_mb as number | undefined,
    memory_limit_mb: resources?.memory_limit_mb as number | undefined,
    enabled_collectors: profile.collectors as string[] | undefined,
    advanced_settings: profile.advanced as Record<string, unknown> | undefined,
  };

  // Validate parsed input
  const errors = validateProfile(input);
  if (errors.length > 0) {
    return { errors };
  }

  return { input };
}
