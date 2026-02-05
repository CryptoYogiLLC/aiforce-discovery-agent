import { pool } from "../database";
import {
  ScanRun,
  InspectionTarget,
  STARTABLE_STATUSES,
  STOPPABLE_STATUSES,
} from "../../models/scanRun";
import { getProfileById } from "../profileService";
import { scanEvents } from "../scanEvents";
import { logger } from "../logger";
import { getScanById, getScanCollectors } from "./queries";
import {
  createCollectorRecord,
  triggerCollector,
  updateCollectorStatus,
  stopCollector,
} from "./collectors";
import {
  COLLECTOR_URLS,
  INTERNAL_API_KEY,
  APPROVAL_API_URL,
} from "./constants";

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

  const scan = (await import("../../models/scanRun")).rowToScanRun(
    result.rows[0] as Record<string, unknown>,
  );
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
    triggerCollector(
      scanId,
      collectorName,
      scan.config_snapshot as unknown as Record<string, unknown>,
    ).catch(async (err) => {
      logger.error("Failed to trigger collector", {
        scanId,
        collector: collectorName,
        error: (err as Error).message,
      });
      // Update collector status to failed
      await updateCollectorStatus(
        scanId,
        collectorName,
        "failed",
        0,
        (err as Error).message,
      );
    });
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
 * Skip deep inspection — complete the scan without inspecting databases.
 * Called when user clicks "Skip Inspection" (sends empty targets array).
 */
export async function skipInspection(scanId: string): Promise<ScanRun> {
  const scan = await getScanById(scanId);
  if (!scan) {
    throw new Error("Scan not found");
  }

  if (scan.status !== "awaiting_inspection") {
    throw new Error(`Cannot skip inspection in status: ${scan.status}`);
  }

  // Mark inspection phase as skipped and complete the scan
  await pool.query(
    `UPDATE gateway.scan_runs
     SET status = 'completed',
         completed_at = NOW(),
         phases = jsonb_set(phases, '{inspection,status}', '"completed"')
     WHERE id = $1`,
    [scanId],
  );

  scanEvents.emitComplete(scanId, "completed");

  logger.info("Inspection skipped, scan completed", { scanId });

  return (await getScanById(scanId))!;
}

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
