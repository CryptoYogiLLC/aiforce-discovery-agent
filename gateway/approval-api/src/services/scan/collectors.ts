import { pool } from "../database";
import { CollectorStatus } from "../../models/scanRun";
import { scanEvents } from "../scanEvents";
import { logger } from "../logger";
import {
  COLLECTOR_URLS,
  INTERNAL_API_KEY,
  APPROVAL_API_URL,
  parsePortRanges,
} from "./constants";

/**
 * Create a collector record for tracking
 */
export async function createCollectorRecord(
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
export async function updateCollectorStatus(
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
export async function triggerCollector(
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
    const advancedSettings =
      (config.advanced_settings as Record<string, unknown>) || {};
    body = {
      scan_id: scanId,
      subnets: config.target_subnets || ["192.168.1.0/24"],
      port_ranges: parsePortRanges(
        config.port_ranges as Record<string, string>,
      ),
      rate_limit_pps: config.scan_rate_limit || 100,
      timeout_ms: ((config.timeout_seconds as number) || 30) * 1000,
      max_concurrent_hosts: Math.min(
        Math.max((advancedSettings.max_concurrent_hosts as number) || 50, 1),
        500,
      ),
      dead_host_threshold: Math.min(
        Math.max((advancedSettings.dead_host_threshold as number) || 5, 1),
        50,
      ),
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
export async function stopCollector(
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
