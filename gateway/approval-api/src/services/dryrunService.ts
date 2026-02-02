/**
 * Dry-Run Session service
 * Reference: ADR-004 Dry-Run Orchestration Model, ADR-006 Data Partitioning, GitHub Issue #57
 *
 * NOTE: This service handles dry-run session management in the approval-api.
 * Actual Docker orchestration is delegated to a separate orchestrator service
 * via internal HTTP calls (per ADR-004 privilege isolation).
 */

import { pool } from "./database";
import {
  DryrunSession,
  DryrunSessionSummary,
  DryrunDiscovery,
  DryrunContainer,
  DryrunSessionStatus,
  rowToSession,
  rowToSessionSummary,
  rowToDiscovery,
  rowToContainer,
  CLEANABLE_STATUSES,
} from "../models/dryrun";
import { getProfileById } from "./profileService";
import { logger } from "./logger";

// Orchestrator URL from config (internal service)
const ORCHESTRATOR_URL =
  process.env.DRYRUN_ORCHESTRATOR_URL || "http://dryrun-orchestrator:8030";

/**
 * Create a new dry-run session
 */
export async function createSession(
  profileId: string,
  startedBy: string,
): Promise<DryrunSession> {
  // Get profile for config snapshot
  const profile = await getProfileById(profileId);
  if (!profile) {
    throw new Error("Profile not found");
  }

  const result = await pool.query(
    `INSERT INTO gateway.dryrun_sessions (profile_id, config_snapshot, started_by)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [profileId, JSON.stringify(profile), startedBy],
  );

  const session = rowToSession(result.rows[0] as Record<string, unknown>);
  logger.info("Dry-run session created", { sessionId: session.id, profileId });

  return session;
}

/**
 * Start a dry-run session (trigger orchestrator)
 * Per ADR-004: Approval API communicates with orchestrator via internal HTTP
 */
export async function startSession(sessionId: string): Promise<DryrunSession> {
  // Update status to generating
  await updateSessionStatus(sessionId, "generating");

  try {
    // Call orchestrator to start test environment with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30-second timeout

    const response = await fetch(`${ORCHESTRATOR_URL}/api/dryrun/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Orchestrator failed: ${error}`);
    }

    const data = (await response.json()) as {
      container_count: number;
      network_name: string;
    };

    // Update session with container info
    const result = await pool.query(
      `UPDATE gateway.dryrun_sessions
       SET status = 'running', container_count = $1, network_name = $2, started_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [data.container_count, data.network_name, sessionId],
    );

    logger.info("Dry-run session started", {
      sessionId,
      containerCount: data.container_count,
    });

    return rowToSession(result.rows[0] as Record<string, unknown>);
  } catch (err) {
    // Mark session as failed
    await updateSessionStatus(sessionId, "failed", (err as Error).message);
    throw err;
  }
}

/**
 * Update session status
 */
export async function updateSessionStatus(
  sessionId: string,
  status: DryrunSessionStatus,
  errorMessage?: string,
): Promise<void> {
  const updates = ["status = $1"];
  const params: unknown[] = [status];

  if (status === "completed") {
    updates.push(`completed_at = NOW()`);
  }

  if (status === "cleaned") {
    updates.push(`cleanup_at = NOW()`);
  }

  if (errorMessage) {
    updates.push(`error_message = $${params.length + 1}`);
    params.push(errorMessage);
  }

  params.push(sessionId);

  await pool.query(
    `UPDATE gateway.dryrun_sessions SET ${updates.join(", ")} WHERE id = $${
      params.length
    }`,
    params,
  );

  logger.info("Dry-run session status updated", { sessionId, status });
}

/**
 * Get session by ID
 */
export async function getSessionById(
  sessionId: string,
): Promise<DryrunSession | null> {
  const result = await pool.query(
    "SELECT * FROM gateway.dryrun_sessions WHERE id = $1",
    [sessionId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return rowToSession(result.rows[0] as Record<string, unknown>);
}

/**
 * Get session summary by ID
 */
export async function getSessionSummary(
  sessionId: string,
): Promise<DryrunSessionSummary | null> {
  const result = await pool.query(
    "SELECT * FROM gateway.dryrun_session_summary WHERE id = $1",
    [sessionId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return rowToSessionSummary(result.rows[0] as Record<string, unknown>);
}

/**
 * List sessions with optional filters
 */
export async function listSessions(filters?: {
  status?: DryrunSessionStatus;
  started_by?: string;
  limit?: number;
  offset?: number;
}): Promise<{ sessions: DryrunSessionSummary[]; total: number }> {
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

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Get total count
  const countResult = await pool.query(
    `SELECT COUNT(*) FROM gateway.dryrun_session_summary ${whereClause}`,
    params,
  );
  const total = parseInt(
    (countResult.rows[0] as Record<string, unknown>).count as string,
  );

  // Get paginated results
  const limit = filters?.limit || 20;
  const offset = filters?.offset || 0;

  const result = await pool.query(
    `SELECT * FROM gateway.dryrun_session_summary ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...params, limit, offset],
  );

  const sessions = result.rows.map((row) =>
    rowToSessionSummary(row as Record<string, unknown>),
  );

  return { sessions, total };
}

/**
 * Stop a running session (cleanup containers)
 */
export async function stopSession(sessionId: string): Promise<DryrunSession> {
  const session = await getSessionById(sessionId);
  if (!session) {
    throw new Error("Session not found");
  }

  if (
    !CLEANABLE_STATUSES.includes(session.status) &&
    session.status !== "running"
  ) {
    throw new Error(`Cannot stop session in status: ${session.status}`);
  }

  // Update status to cleaning_up
  await updateSessionStatus(sessionId, "cleaning_up");

  try {
    // Call orchestrator to cleanup containers with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30-second timeout

    const response = await fetch(`${ORCHESTRATOR_URL}/api/dryrun/cleanup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Cleanup failed: ${error}`);
    }

    // Mark as cleaned
    await updateSessionStatus(sessionId, "cleaned");

    logger.info("Dry-run session stopped and cleaned", { sessionId });

    return (await getSessionById(sessionId))!;
  } catch (err) {
    // Mark as failed but keep container info for manual cleanup
    await updateSessionStatus(
      sessionId,
      "failed",
      `Cleanup failed: ${(err as Error).message}`,
    );
    throw err;
  }
}

/**
 * Add a discovery to a session
 */
export async function addDiscovery(
  sessionId: string,
  source: string,
  discoveryType: string,
  data: Record<string, unknown>,
): Promise<DryrunDiscovery> {
  const result = await pool.query(
    `INSERT INTO gateway.dryrun_discoveries (session_id, source, discovery_type, data)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [sessionId, source, discoveryType, JSON.stringify(data)],
  );

  return rowToDiscovery(result.rows[0] as Record<string, unknown>);
}

/**
 * Get discoveries for a session
 */
export async function getSessionDiscoveries(
  sessionId: string,
  filters?: {
    source?: string;
    status?: string;
    limit?: number;
    offset?: number;
  },
): Promise<{ discoveries: DryrunDiscovery[]; total: number }> {
  const conditions: string[] = ["session_id = $1"];
  const params: unknown[] = [sessionId];
  let paramIndex = 2;

  if (filters?.source) {
    conditions.push(`source = $${paramIndex++}`);
    params.push(filters.source);
  }

  if (filters?.status) {
    conditions.push(`status = $${paramIndex++}`);
    params.push(filters.status);
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  // Get total count
  const countResult = await pool.query(
    `SELECT COUNT(*) FROM gateway.dryrun_discoveries ${whereClause}`,
    params,
  );
  const total = parseInt(
    (countResult.rows[0] as Record<string, unknown>).count as string,
  );

  // Get paginated results
  const limit = filters?.limit || 50;
  const offset = filters?.offset || 0;

  const result = await pool.query(
    `SELECT * FROM gateway.dryrun_discoveries ${whereClause}
     ORDER BY discovered_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...params, limit, offset],
  );

  const discoveries = result.rows.map((row) =>
    rowToDiscovery(row as Record<string, unknown>),
  );

  return { discoveries, total };
}

/**
 * Review a discovery (approve/reject practice)
 */
export async function reviewDiscovery(
  discoveryId: string,
  status: "approved" | "rejected",
  reviewedBy: string,
  notes?: string,
): Promise<DryrunDiscovery> {
  const result = await pool.query(
    `UPDATE gateway.dryrun_discoveries
     SET status = $1, reviewed_by = $2, reviewed_at = NOW(), review_notes = $3
     WHERE id = $4
     RETURNING *`,
    [status, reviewedBy, notes || null, discoveryId],
  );

  if (result.rows.length === 0) {
    throw new Error("Discovery not found");
  }

  logger.info("Dry-run discovery reviewed", { discoveryId, status });
  return rowToDiscovery(result.rows[0] as Record<string, unknown>);
}

/**
 * Get discovery by ID
 */
export async function getDiscoveryById(
  discoveryId: string,
): Promise<DryrunDiscovery | null> {
  const result = await pool.query(
    "SELECT * FROM gateway.dryrun_discoveries WHERE id = $1",
    [discoveryId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return rowToDiscovery(result.rows[0] as Record<string, unknown>);
}

/**
 * Register a container for a session
 */
export async function registerContainer(
  sessionId: string,
  containerId: string,
  containerName: string,
  serviceType: string,
  image: string,
  portMappings: Array<{ host: number; container: number; protocol: string }>,
): Promise<DryrunContainer> {
  const result = await pool.query(
    `INSERT INTO gateway.dryrun_containers
     (session_id, container_id, container_name, service_type, image, port_mappings)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      sessionId,
      containerId,
      containerName,
      serviceType,
      image,
      JSON.stringify(portMappings),
    ],
  );

  return rowToContainer(result.rows[0] as Record<string, unknown>);
}

/**
 * Get containers for a session
 */
export async function getSessionContainers(
  sessionId: string,
): Promise<DryrunContainer[]> {
  const result = await pool.query(
    "SELECT * FROM gateway.dryrun_containers WHERE session_id = $1",
    [sessionId],
  );

  return result.rows.map((row) =>
    rowToContainer(row as Record<string, unknown>),
  );
}

/**
 * Update container status
 */
export async function updateContainerStatus(
  containerId: string,
  status: string,
): Promise<void> {
  await pool.query(
    "UPDATE gateway.dryrun_containers SET status = $1 WHERE container_id = $2",
    [status, containerId],
  );
}

/**
 * Export session results as JSON
 */
export async function exportSessionResults(sessionId: string): Promise<object> {
  const session = await getSessionSummary(sessionId);
  if (!session) {
    throw new Error("Session not found");
  }

  const { discoveries } = await getSessionDiscoveries(sessionId, {
    limit: 10000,
  });
  const containers = await getSessionContainers(sessionId);

  return {
    export_version: "1.0",
    export_date: new Date().toISOString(),
    session: {
      id: session.id,
      profile_name: session.profile_name,
      status: session.status,
      started_at: session.started_at,
      completed_at: session.completed_at,
      container_count: session.container_count,
      discovery_count: session.discovery_count,
      approved_count: session.approved_count,
      rejected_count: session.rejected_count,
    },
    containers: containers.map((c) => ({
      name: c.container_name,
      service_type: c.service_type,
      image: c.image,
      ports: c.port_mappings,
    })),
    discoveries: discoveries.map((d) => ({
      source: d.source,
      type: d.discovery_type,
      status: d.status,
      data: d.data,
      reviewed_at: d.reviewed_at,
      review_notes: d.review_notes,
    })),
    metadata: {
      is_dryrun: true,
      note: "This data was collected from a simulated test environment, not production systems.",
    },
  };
}

/**
 * Cleanup old sessions (called periodically)
 */
export async function cleanupOldSessions(): Promise<number> {
  const result = await pool.query(
    "SELECT gateway.cleanup_old_dryrun_sessions()",
  );
  return (result.rows[0] as Record<string, unknown>)
    .cleanup_old_dryrun_sessions as number;
}

/**
 * Mark session as completed (called by collector when done)
 */
export async function markSessionCompleted(sessionId: string): Promise<void> {
  await updateSessionStatus(sessionId, "completed");
}

/**
 * Check if there's an active session (prevent concurrent dry-runs)
 */
export async function hasActiveSession(): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM gateway.dryrun_sessions
     WHERE status IN ('pending', 'generating', 'running')
     LIMIT 1`,
  );
  return result.rows.length > 0;
}
