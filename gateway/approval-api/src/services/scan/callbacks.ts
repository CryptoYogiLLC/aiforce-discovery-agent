import { pool } from "../database";
import {
  ScanRunStatus,
  CollectorProgressCallback,
  CollectorCompleteCallback,
  CollectorStatus,
} from "../../models/scanRun";
import { scanEvents } from "../scanEvents";
import { logger } from "../logger";
import { getScanCollectors } from "./queries";
import { COLLECTOR_PHASE_MAP } from "./constants";

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
     WHERE scan_id = $4 AND collector_name = $5 AND COALESCE(last_sequence, -1) < $3
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

  // Update phase discovery count and emit to frontend
  const updatedPhases = await updatePhaseDiscoveryCount(
    callback.scan_id,
    callback.collector,
  );
  if (updatedPhases) {
    scanEvents.emitScanData(callback.scan_id, { phases: updatedPhases });
  }

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

  // Update phase discovery count
  await updatePhaseDiscoveryCount(callback.scan_id, callback.collector);

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
export async function updateScanDiscoveryCount(scanId: string): Promise<void> {
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
 * Update phase discovery count by summing all collectors in that phase.
 * Uses SUM (not increment) for race-safety.
 * Returns the updated phases JSONB or null if collector has no phase mapping.
 */
export async function updatePhaseDiscoveryCount(
  scanId: string,
  collectorName: string,
): Promise<Record<string, unknown> | null> {
  const phase = COLLECTOR_PHASE_MAP[collectorName];
  if (!phase) {
    return null;
  }

  // Get all collector names that belong to this phase
  const phaseCollectors = Object.entries(COLLECTOR_PHASE_MAP)
    .filter(([, p]) => p === phase)
    .map(([name]) => name);

  // SUM discovery_count from all collectors in this phase
  const sumResult = await pool.query(
    `SELECT COALESCE(SUM(discovery_count), 0) AS total
     FROM gateway.scan_collectors
     WHERE scan_id = $1 AND collector_name = ANY($2)`,
    [scanId, phaseCollectors],
  );
  const phaseTotal = parseInt(
    (sumResult.rows[0] as Record<string, unknown>).total as string,
  );

  // Atomically update phases JSONB
  const updateResult = await pool.query(
    `UPDATE gateway.scan_runs
     SET phases = jsonb_set(phases, $1, $2::jsonb)
     WHERE id = $3
     RETURNING phases`,
    [`{${phase},discovery_count}`, JSON.stringify(phaseTotal), scanId],
  );

  if (updateResult.rows.length === 0) {
    return null;
  }

  return (updateResult.rows[0] as Record<string, unknown>).phases as Record<
    string,
    unknown
  >;
}

/**
 * Check if all collectors have completed and update scan status
 */
export async function checkScanCompletion(scanId: string): Promise<void> {
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

  // Update phase status — nest jsonb_set calls so `phases` is assigned once
  let phasesExpr = `jsonb_set(jsonb_set(phases, '{enumeration,status}', '"completed"'), '{enumeration,progress}', '100')`;

  if (newStatus === "awaiting_inspection") {
    phasesExpr = `jsonb_set(jsonb_set(${phasesExpr}, '{identification,status}', '"completed"'), '{identification,progress}', '100')`;
  }

  updates.push(`phases = ${phasesExpr}`);

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

/**
 * Check for stuck scans (no heartbeat from any collector for too long)
 * Should be called periodically (e.g. every 60s) from a timer
 */
export async function detectStuckScans(): Promise<void> {
  const stuckThresholdMinutes = 10;

  try {
    // Find scans in active state where ALL collectors have stale heartbeats
    const result = await pool.query(
      `SELECT sr.id, sr.status
       FROM gateway.scan_runs sr
       WHERE sr.status IN ('scanning', 'inspecting')
         AND sr.started_at < NOW() - INTERVAL '${stuckThresholdMinutes} minutes'
         AND NOT EXISTS (
           SELECT 1 FROM gateway.scan_collectors sc
           WHERE sc.scan_id = sr.id
             AND sc.status IN ('starting', 'running')
             AND sc.last_heartbeat_at > NOW() - INTERVAL '${stuckThresholdMinutes} minutes'
         )`,
    );

    for (const row of result.rows) {
      const scanId = (row as Record<string, unknown>).id as string;
      logger.warn("Stuck scan detected, marking as failed", { scanId });

      // Mark all non-terminal collectors as timed out
      await pool.query(
        `UPDATE gateway.scan_collectors
         SET status = 'timeout', completed_at = NOW(),
             error_message = 'No heartbeat received - collector appears stuck'
         WHERE scan_id = $1 AND status NOT IN ('completed', 'failed', 'timeout')`,
        [scanId],
      );

      // Mark scan as failed
      await pool.query(
        `UPDATE gateway.scan_runs
         SET status = 'failed', completed_at = NOW(),
             error_message = 'Scan timed out: no collector heartbeat for ${stuckThresholdMinutes} minutes'
         WHERE id = $1`,
        [scanId],
      );

      scanEvents.emitComplete(scanId, "failed");
    }
  } catch (err) {
    logger.error("Failed to check for stuck scans", {
      error: (err as Error).message,
    });
  }
}
