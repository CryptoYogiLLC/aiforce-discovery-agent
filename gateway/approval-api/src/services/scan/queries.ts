import { pool } from "../database";
import {
  ScanRun,
  ScanRunSummary,
  ScanCollector,
  ScanRunStatus,
  rowToScanRun,
  rowToScanRunSummary,
  rowToScanCollector,
} from "../../models/scanRun";

/**
 * Get scan by ID
 */
export async function getScanById(scanId: string): Promise<ScanRun | null> {
  const result = await pool.query(
    "SELECT * FROM gateway.scan_runs WHERE id = $1",
    [scanId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return rowToScanRun(result.rows[0] as Record<string, unknown>);
}

/**
 * Get scan summary by ID (includes collector counts)
 */
export async function getScanSummary(
  scanId: string,
): Promise<ScanRunSummary | null> {
  const result = await pool.query(
    "SELECT * FROM gateway.scan_run_summary WHERE id = $1",
    [scanId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return rowToScanRunSummary(result.rows[0] as Record<string, unknown>);
}

/**
 * List scans with optional filters
 */
export async function listScans(filters?: {
  status?: ScanRunStatus;
  started_by?: string;
  profile_id?: string;
  limit?: number;
  offset?: number;
}): Promise<{ scans: ScanRunSummary[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters?.status) {
    conditions.push(`status = $${paramIndex++}`);
    params.push(filters.status);
  }

  if (filters?.started_by) {
    conditions.push(`started_by = $${paramIndex++}`);
    params.push(filters.started_by);
  }

  if (filters?.profile_id) {
    conditions.push(`profile_id = $${paramIndex++}`);
    params.push(filters.profile_id);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Get total count
  const countResult = await pool.query(
    `SELECT COUNT(*) FROM gateway.scan_run_summary ${whereClause}`,
    params,
  );
  const total = parseInt(
    (countResult.rows[0] as Record<string, unknown>).count as string,
  );

  // Get paginated results
  const limit = filters?.limit || 20;
  const offset = filters?.offset || 0;

  const result = await pool.query(
    `SELECT * FROM gateway.scan_run_summary ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...params, limit, offset],
  );

  const scans = result.rows.map((row) =>
    rowToScanRunSummary(row as Record<string, unknown>),
  );

  return { scans, total };
}

/**
 * Get discoveries for a scan
 */
export async function getScanDiscoveries(
  scanId: string,
  filters?: {
    source_service?: string;
    event_type?: string;
    candidate?: boolean;
    limit?: number;
    offset?: number;
  },
): Promise<{ discoveries: Record<string, unknown>[]; total: number }> {
  const conditions: string[] = ["scan_id = $1"];
  const params: unknown[] = [scanId];
  let paramIndex = 2;

  if (filters?.source_service) {
    conditions.push(`source_service = $${paramIndex++}`);
    params.push(filters.source_service);
  }

  if (filters?.event_type) {
    conditions.push(`event_type = $${paramIndex++}`);
    params.push(filters.event_type);
  }

  // Filter for database candidates (JSONB query)
  if (filters?.candidate === true) {
    conditions.push(`payload->'metadata'->>'database_candidate' = 'true'`);
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  // Get total count
  const countResult = await pool.query(
    `SELECT COUNT(*) FROM gateway.discoveries ${whereClause}`,
    params,
  );
  const total = parseInt(
    (countResult.rows[0] as Record<string, unknown>).count as string,
  );

  // Get paginated results
  const limit = filters?.limit || 50;
  const offset = filters?.offset || 0;

  const result = await pool.query(
    `SELECT * FROM gateway.discoveries ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...params, limit, offset],
  );

  return { discoveries: result.rows as Record<string, unknown>[], total };
}

/**
 * Get collectors for a scan
 */
export async function getScanCollectors(
  scanId: string,
): Promise<ScanCollector[]> {
  const result = await pool.query(
    "SELECT * FROM gateway.scan_collectors WHERE scan_id = $1 ORDER BY collector_name",
    [scanId],
  );

  return result.rows.map((row) =>
    rowToScanCollector(row as Record<string, unknown>),
  );
}

/**
 * Check if there's an active scan for a profile
 */
export async function hasActiveScan(profileId?: string): Promise<boolean> {
  const conditions = [
    "status IN ('pending', 'scanning', 'awaiting_inspection', 'inspecting')",
  ];
  const params: unknown[] = [];

  if (profileId) {
    conditions.push("profile_id = $1");
    params.push(profileId);
  }

  const result = await pool.query(
    `SELECT 1 FROM gateway.scan_runs WHERE ${conditions.join(" AND ")} LIMIT 1`,
    params,
  );

  return result.rows.length > 0;
}
