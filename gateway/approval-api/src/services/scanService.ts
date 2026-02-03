/**
 * Scan Run orchestration service
 * Reference: ADR-007 Discovery Acquisition Model, GitHub Issue #108
 *
 * Orchestrates autonomous discovery pipeline:
 * 1. Create scan from profile
 * 2. Start collectors with callback URLs
 * 3. Track progress via callbacks
 * 4. Manage lifecycle transitions
 */

import { pool } from "./database";
import {
  ScanRun,
  ScanRunSummary,
  ScanCollector,
  ScanRunStatus,
  CollectorStatus,
  CollectorProgressCallback,
  CollectorCompleteCallback,
  InspectionTarget,
  rowToScanRun,
  rowToScanRunSummary,
  rowToScanCollector,
  STARTABLE_STATUSES,
  STOPPABLE_STATUSES,
} from "../models/scanRun";
import { getProfileById } from "./profileService";
import { scanEvents } from "./scanEvents";
import { logger } from "./logger";

// Internal API key for callbacks (collectors use this to auth)
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "";

// Collector service URLs (internal Docker network)
const COLLECTOR_URLS = {
  "network-scanner":
    process.env.NETWORK_SCANNER_URL || "http://network-scanner:8001",
  "code-analyzer": process.env.CODE_ANALYZER_URL || "http://code-analyzer:8002",
  "db-inspector": process.env.DB_INSPECTOR_URL || "http://db-inspector:8003",
};

// Approval API base URL for callbacks
const APPROVAL_API_URL =
  process.env.APPROVAL_API_URL || "http://approval-api:3001";

/**
 * Create a new scan run from a profile
 */
export async function createScan(
  profileId: string,
  startedBy: string,
): Promise<ScanRun> {
  // Get profile for config snapshot
  const profile = await getProfileById(profileId);
  if (!profile) {
    throw new Error("Profile not found");
  }

  const result = await pool.query(
    `INSERT INTO gateway.scan_runs (profile_id, config_snapshot, started_by)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [profileId, JSON.stringify(profile), startedBy],
  );

  const scan = rowToScanRun(result.rows[0] as Record<string, unknown>);
  logger.info("Scan run created", { scanId: scan.id, profileId });

  return scan;
}

/**
 * Start a scan run (idempotent - can be called multiple times)
 * Triggers enabled collectors with callback URLs
 */
export async function startScan(scanId: string): Promise<ScanRun> {
  const scan = await getScanById(scanId);
  if (!scan) {
    throw new Error("Scan not found");
  }

  // Idempotent: if already running/scanning, return current state
  if (scan.status === "scanning") {
    logger.info("Scan already running", { scanId });
    return scan;
  }

  // Can only start from pending status
  if (!STARTABLE_STATUSES.includes(scan.status)) {
    throw new Error(`Cannot start scan in status: ${scan.status}`);
  }

  // Update to scanning status
  await pool.query(
    `UPDATE gateway.scan_runs
     SET status = 'scanning', started_at = NOW(),
         phases = jsonb_set(phases, '{enumeration,status}', '"running"')
     WHERE id = $1`,
    [scanId],
  );

  // Emit status change
  scanEvents.emitStatus(scanId, {
    scan_id: scanId,
    status: "scanning",
    timestamp: new Date().toISOString(),
  });

  // Get enabled collectors from config
  const enabledCollectors = scan.config_snapshot.enabled_collectors || [
    "network-scanner",
    "code-analyzer",
  ];

  // Create collector records and trigger each
  for (const collectorName of enabledCollectors) {
    await createCollectorRecord(scanId, collectorName);

    // Trigger collector asynchronously (don't wait)
    triggerCollector(scanId, collectorName, scan.config_snapshot).catch(
      (err) => {
        logger.error("Failed to trigger collector", {
          scanId,
          collector: collectorName,
          error: (err as Error).message,
        });
        // Update collector status to failed
        updateCollectorStatus(
          scanId,
          collectorName,
          "failed",
          0,
          (err as Error).message,
        );
      },
    );
  }

  logger.info("Scan started", { scanId, collectors: enabledCollectors });

  return (await getScanById(scanId))!;
}

/**
 * Stop/cancel a running scan
 */
export async function stopScan(scanId: string): Promise<ScanRun> {
  const scan = await getScanById(scanId);
  if (!scan) {
    throw new Error("Scan not found");
  }

  if (!STOPPABLE_STATUSES.includes(scan.status)) {
    throw new Error(`Cannot stop scan in status: ${scan.status}`);
  }

  // Update status to cancelled
  await pool.query(
    `UPDATE gateway.scan_runs
     SET status = 'cancelled', completed_at = NOW(), error_message = 'Cancelled by user'
     WHERE id = $1`,
    [scanId],
  );

  // Try to stop running collectors (best effort)
  const collectors = await getScanCollectors(scanId);
  for (const collector of collectors) {
    if (collector.status === "running" || collector.status === "starting") {
      try {
        await stopCollector(scanId, collector.collector_name);
      } catch (err) {
        logger.warn("Failed to stop collector", {
          scanId,
          collector: collector.collector_name,
          error: (err as Error).message,
        });
      }
    }
  }

  // Emit completion
  scanEvents.emitComplete(scanId, "cancelled");

  logger.info("Scan cancelled", { scanId });
  return (await getScanById(scanId))!;
}

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

// === Collector Management ===

/**
 * Create a collector record for tracking
 */
async function createCollectorRecord(
  scanId: string,
  collectorName: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO gateway.scan_collectors (scan_id, collector_name)
     VALUES ($1, $2)
     ON CONFLICT (scan_id, collector_name) DO NOTHING`,
    [scanId, collectorName],
  );
}

/**
 * Update collector status
 */
async function updateCollectorStatus(
  scanId: string,
  collectorName: string,
  status: CollectorStatus,
  sequence: number,
  errorMessage?: string,
): Promise<void> {
  const updates = ["status = $1", "last_heartbeat_at = NOW()"];
  const params: unknown[] = [status];

  if (status === "running" || status === "starting") {
    updates.push("started_at = COALESCE(started_at, NOW())");
  }

  if (status === "completed" || status === "failed" || status === "timeout") {
    updates.push("completed_at = NOW()");
  }

  if (errorMessage) {
    updates.push(`error_message = $${params.length + 1}`);
    params.push(errorMessage);
  }

  params.push(scanId, collectorName);

  await pool.query(
    `UPDATE gateway.scan_collectors
     SET ${updates.join(", ")}
     WHERE scan_id = $${params.length - 1} AND collector_name = $${
       params.length
     }`,
    params,
  );
}

/**
 * Trigger a collector to start scanning
 */
async function triggerCollector(
  scanId: string,
  collectorName: string,
  config: Record<string, unknown>,
): Promise<void> {
  const baseUrl = COLLECTOR_URLS[collectorName as keyof typeof COLLECTOR_URLS];
  if (!baseUrl) {
    throw new Error(`Unknown collector: ${collectorName}`);
  }

  // Update collector status to starting
  await updateCollectorStatus(scanId, collectorName, "starting", 0);

  // Emit collector status
  scanEvents.emitCollectorStatus(scanId, {
    scan_id: scanId,
    collector: collectorName,
    status: "starting",
    progress: 0,
    discovery_count: 0,
    timestamp: new Date().toISOString(),
  });

  // Build request body based on collector type
  let endpoint: string;
  let body: Record<string, unknown>;

  if (collectorName === "network-scanner") {
    endpoint = `${baseUrl}/api/v1/scan/start`;
    body = {
      scan_id: scanId,
      subnets: config.target_subnets || ["192.168.1.0/24"],
      port_ranges: parsePortRanges(
        config.port_ranges as Record<string, string>,
      ),
      rate_limit_pps: config.scan_rate_limit || 100,
      timeout_ms: ((config.timeout_seconds as number) || 30) * 1000,
      progress_url: `${APPROVAL_API_URL}/api/scans/internal/${scanId}/progress`,
      complete_url: `${APPROVAL_API_URL}/api/scans/internal/${scanId}/complete`,
    };
  } else if (collectorName === "code-analyzer") {
    endpoint = `${baseUrl}/api/v1/discover`;
    body = {
      scan_id: scanId,
      scan_paths: config.code_scan_paths || ["/repos"],
      limits: {
        max_depth: 5,
        max_repos: config.max_services || 100,
      },
      progress_url: `${APPROVAL_API_URL}/api/scans/internal/${scanId}/progress`,
      complete_url: `${APPROVAL_API_URL}/api/scans/internal/${scanId}/complete`,
    };
  } else if (collectorName === "db-inspector") {
    // DB inspector requires targets, which come from inspection phase
    logger.info("DB inspector will be triggered during inspection phase", {
      scanId,
    });
    return;
  } else {
    throw new Error(`Unsupported collector: ${collectorName}`);
  }

  // Make HTTP request to collector
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-API-Key": INTERNAL_API_KEY,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Collector start failed: ${error}`);
    }

    // Update to running status
    await updateCollectorStatus(scanId, collectorName, "running", 0);

    // Emit running status
    scanEvents.emitCollectorStatus(scanId, {
      scan_id: scanId,
      collector: collectorName,
      status: "running",
      progress: 0,
      discovery_count: 0,
      timestamp: new Date().toISOString(),
    });

    logger.info("Collector triggered", { scanId, collector: collectorName });
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Stop a running collector
 */
async function stopCollector(
  scanId: string,
  collectorName: string,
): Promise<void> {
  const baseUrl = COLLECTOR_URLS[collectorName as keyof typeof COLLECTOR_URLS];
  if (!baseUrl) {
    return;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    await fetch(`${baseUrl}/api/v1/scan/stop`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-API-Key": INTERNAL_API_KEY,
      },
      body: JSON.stringify({ scan_id: scanId }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
  } catch (err) {
    logger.warn("Failed to stop collector", {
      scanId,
      collector: collectorName,
      error: (err as Error).message,
    });
  }
}

// === Callback Handlers (called by collectors) ===

/**
 * Handle progress callback from collector
 * Uses sequence-based idempotency: only accept if sequence > last_sequence
 */
export async function handleCollectorProgress(
  callback: CollectorProgressCallback,
): Promise<boolean> {
  // Check sequence for idempotency
  const result = await pool.query(
    `UPDATE gateway.scan_collectors
     SET progress = $1, discovery_count = $2, last_heartbeat_at = NOW(), last_sequence = $3
     WHERE scan_id = $4 AND collector_name = $5 AND last_sequence < $3
     RETURNING id`,
    [
      callback.progress,
      callback.discovery_count,
      callback.sequence,
      callback.scan_id,
      callback.collector,
    ],
  );

  if (result.rows.length === 0) {
    // Sequence already processed or out of order
    logger.debug("Progress callback ignored (stale sequence)", {
      scanId: callback.scan_id,
      collector: callback.collector,
      sequence: callback.sequence,
    });
    return false;
  }

  // Update scan total discoveries
  await updateScanDiscoveryCount(callback.scan_id);

  // Emit progress event
  scanEvents.emitProgress(callback.scan_id, {
    scan_id: callback.scan_id,
    collector: callback.collector,
    phase: callback.phase,
    progress: callback.progress,
    discovery_count: callback.discovery_count,
    message: callback.message,
    timestamp: callback.timestamp,
  });

  logger.debug("Collector progress received", {
    scanId: callback.scan_id,
    collector: callback.collector,
    progress: callback.progress,
  });

  return true;
}

/**
 * Handle completion callback from collector
 * First-write-wins for idempotency
 */
export async function handleCollectorComplete(
  callback: CollectorCompleteCallback,
): Promise<boolean> {
  // Map callback status to CollectorStatus
  const status = callback.status as CollectorStatus;

  // Update collector status (first-write-wins via status check)
  const result = await pool.query(
    `UPDATE gateway.scan_collectors
     SET status = $1, discovery_count = $2, completed_at = NOW(), error_message = $3
     WHERE scan_id = $4 AND collector_name = $5 AND status NOT IN ('completed', 'failed', 'timeout')
     RETURNING id`,
    [
      status,
      callback.discovery_count,
      callback.error_message || null,
      callback.scan_id,
      callback.collector,
    ],
  );

  if (result.rows.length === 0) {
    logger.debug("Complete callback ignored (already terminal)", {
      scanId: callback.scan_id,
      collector: callback.collector,
    });
    return false;
  }

  // Update scan totals
  await updateScanDiscoveryCount(callback.scan_id);

  // Emit collector completion
  scanEvents.emitCollectorStatus(callback.scan_id, {
    scan_id: callback.scan_id,
    collector: callback.collector,
    status,
    progress: 100,
    discovery_count: callback.discovery_count,
    error_message: callback.error_message,
    timestamp: callback.timestamp,
  });

  // Check if all collectors are done
  await checkScanCompletion(callback.scan_id);

  logger.info("Collector completed", {
    scanId: callback.scan_id,
    collector: callback.collector,
    status,
  });

  return true;
}

/**
 * Update total discovery count for scan
 */
async function updateScanDiscoveryCount(scanId: string): Promise<void> {
  await pool.query(
    `UPDATE gateway.scan_runs
     SET total_discoveries = (
       SELECT COUNT(*) FROM gateway.discoveries WHERE scan_id = $1
     )
     WHERE id = $1`,
    [scanId],
  );
}

/**
 * Check if all collectors have completed and update scan status
 */
async function checkScanCompletion(scanId: string): Promise<void> {
  const collectors = await getScanCollectors(scanId);

  const allDone = collectors.every((c) =>
    ["completed", "failed", "timeout"].includes(c.status),
  );

  if (!allDone) {
    return;
  }

  const anyFailed = collectors.some((c) =>
    ["failed", "timeout"].includes(c.status),
  );

  // Check for database candidates (determines if we go to awaiting_inspection)
  const candidateResult = await pool.query(
    `SELECT COUNT(*) FROM gateway.discoveries
     WHERE scan_id = $1 AND payload->'metadata'->>'database_candidate' = 'true'`,
    [scanId],
  );
  const candidateCount = parseInt(
    (candidateResult.rows[0] as Record<string, unknown>).count as string,
  );

  let newStatus: ScanRunStatus;
  if (anyFailed && candidateCount === 0) {
    // All failed and no candidates - mark as failed
    newStatus = "failed";
  } else if (candidateCount > 0) {
    // Has database candidates - await inspection
    newStatus = "awaiting_inspection";
  } else {
    // No candidates, all done - completed
    newStatus = "completed";
  }

  // Update scan status
  const updates = ["status = $1"];
  const params: unknown[] = [newStatus];

  if (newStatus === "completed" || newStatus === "failed") {
    updates.push("completed_at = NOW()");
  }

  // Update phase status
  updates.push(
    `phases = jsonb_set(phases, '{enumeration,status}', '"completed"')`,
  );
  updates.push(`phases = jsonb_set(phases, '{enumeration,progress}', '100')`);

  if (newStatus === "awaiting_inspection") {
    updates.push(
      `phases = jsonb_set(phases, '{identification,status}', '"completed"')`,
    );
    updates.push(
      `phases = jsonb_set(phases, '{identification,progress}', '100')`,
    );
  }

  params.push(scanId);

  await pool.query(
    `UPDATE gateway.scan_runs SET ${updates.join(", ")} WHERE id = $${
      params.length
    }`,
    params,
  );

  // Emit completion
  if (newStatus === "completed" || newStatus === "failed") {
    scanEvents.emitComplete(scanId, newStatus);
  } else {
    scanEvents.emitStatus(scanId, {
      scan_id: scanId,
      status: newStatus,
      timestamp: new Date().toISOString(),
    });
  }

  logger.info("Scan phase completed", {
    scanId,
    status: newStatus,
    candidateCount,
  });
}

// === Inspection Phase ===

/**
 * Trigger deep inspection for database candidates
 * Called after user provides credentials for selected candidates
 */
export async function triggerInspection(
  scanId: string,
  targets: InspectionTarget[],
): Promise<ScanRun> {
  const scan = await getScanById(scanId);
  if (!scan) {
    throw new Error("Scan not found");
  }

  if (scan.status !== "awaiting_inspection") {
    throw new Error(`Cannot trigger inspection in status: ${scan.status}`);
  }

  // Update status to inspecting
  await pool.query(
    `UPDATE gateway.scan_runs
     SET status = 'inspecting',
         phases = jsonb_set(phases, '{inspection,status}', '"running"')
     WHERE id = $1`,
    [scanId],
  );

  // Emit status change
  scanEvents.emitStatus(scanId, {
    scan_id: scanId,
    status: "inspecting",
    timestamp: new Date().toISOString(),
  });

  // Ensure db-inspector collector record exists
  await createCollectorRecord(scanId, "db-inspector");
  await updateCollectorStatus(scanId, "db-inspector", "running", 0);

  // Trigger db-inspector with targets
  const baseUrl = COLLECTOR_URLS["db-inspector"];
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(`${baseUrl}/api/v1/inspect/batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-API-Key": INTERNAL_API_KEY,
      },
      body: JSON.stringify({
        scan_id: scanId,
        targets,
        progress_url: `${APPROVAL_API_URL}/api/scans/internal/${scanId}/progress`,
        complete_url: `${APPROVAL_API_URL}/api/scans/internal/${scanId}/complete`,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`DB Inspector failed: ${error}`);
    }

    logger.info("Inspection triggered", {
      scanId,
      targetCount: targets.length,
    });
  } catch (err) {
    // Mark inspection as failed
    await pool.query(
      `UPDATE gateway.scan_runs
       SET status = 'failed', error_message = $1, completed_at = NOW()
       WHERE id = $2`,
      [(err as Error).message, scanId],
    );
    throw err;
  }

  return (await getScanById(scanId))!;
}

// === Utility Functions ===

/**
 * Parse port ranges from config format to flat list
 */
function parsePortRanges(
  portRanges: Record<string, string> | undefined,
): string[] {
  if (!portRanges) {
    return ["1-1024", "3306", "5432"];
  }

  const ports: string[] = [];
  if (portRanges.tcp) {
    ports.push(...portRanges.tcp.split(",").map((p) => p.trim()));
  }
  return ports;
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
