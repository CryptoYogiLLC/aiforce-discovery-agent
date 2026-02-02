/**
 * Audit Trail and Transmission History service
 * Reference: GitHub Issue #59
 */

import crypto from "crypto";
import { pool } from "./database";
import {
  TransmissionBatch,
  TransmissionBatchSummary,
  TransmissionItem,
  TransmissionItemSummary,
  AuditLogEntry,
  LogEventInput,
  CreateItemInput,
  AuditEventType,
  rowToBatch,
  rowToBatchSummary,
  rowToItem,
  rowToItemSummary,
  rowToAuditLog,
} from "../models/auditTrail";
import { logger } from "./logger";

/**
 * Recursively sort object keys for canonical JSON representation
 */
function deepSortObject(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(deepSortObject);
  }

  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  for (const key of keys) {
    sorted[key] = deepSortObject((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}

/**
 * Compute SHA-256 hash of canonical JSON
 * Uses deep sort to ensure consistent hashing regardless of key order
 */
function computeHash(data: Record<string, unknown>): string {
  // Canonical JSON: recursively sorted keys, no extra whitespace
  const sortedData = deepSortObject(data);
  const canonical = JSON.stringify(sortedData);
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

/**
 * Log an audit event
 */
export async function logAuditEvent(input: LogEventInput): Promise<void> {
  await pool.query(
    `INSERT INTO gateway.audit_log
     (event_type, actor_id, actor_username, actor_ip, target_type, target_id, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.event_type,
      input.actor_id || null,
      input.actor_username || null,
      input.actor_ip || null,
      input.target_type || null,
      input.target_id || null,
      JSON.stringify(input.details || {}),
    ],
  );
}

/**
 * Create a new transmission batch
 * Uses a transaction to ensure atomicity - either all items are inserted or none
 */
export async function createBatch(
  items: CreateItemInput[],
  createdBy: string,
): Promise<TransmissionBatch> {
  // Calculate batch hash from all items
  const allPayloads = items.map((i) => i.payload);
  const batchHash = computeHash({ items: allPayloads });
  const totalSize = JSON.stringify(allPayloads).length;

  // Use a transaction to ensure atomicity
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Create batch
    const batchResult = await client.query(
      `INSERT INTO gateway.transmission_batches
       (item_count, total_size_bytes, batch_hash, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [items.length, totalSize, batchHash, createdBy],
    );

    const batch = rowToBatch(batchResult.rows[0] as Record<string, unknown>);

    // Insert items
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const payloadHash = computeHash(item.payload);

      await client.query(
        `INSERT INTO gateway.transmission_items
         (batch_id, discovery_id, event_type, record_summary, payload, payload_hash, redacted_fields, redaction_reasons, sequence_number)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          batch.id,
          item.discovery_id || null,
          item.event_type,
          item.record_summary || null,
          JSON.stringify(item.payload),
          payloadHash,
          JSON.stringify(item.redacted_fields || []),
          JSON.stringify(item.redaction_reasons || {}),
          i + 1,
        ],
      );
    }

    await client.query("COMMIT");

    // Log audit event outside transaction (it's append-only, safe to log separately)
    await logAuditEvent({
      event_type: "batch_created",
      actor_id: createdBy,
      target_type: "batch",
      target_id: batch.id,
      details: { item_count: items.length, total_size: totalSize },
    });

    logger.info("Transmission batch created", {
      batchId: batch.id,
      itemCount: items.length,
    });

    return batch;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Update batch status after transmission
 */
export async function updateBatchStatus(
  batchId: string,
  status: "success" | "failed" | "retrying",
  responseCode?: number,
  responseMessage?: string,
  durationMs?: number,
): Promise<TransmissionBatch> {
  const updates = ["status = $1", "transmitted_at = NOW()"];
  const params: unknown[] = [status];

  if (responseCode !== undefined) {
    updates.push(`response_code = $${params.length + 1}`);
    params.push(responseCode);
  }

  if (responseMessage !== undefined) {
    updates.push(`response_message = $${params.length + 1}`);
    params.push(responseMessage);
  }

  if (durationMs !== undefined) {
    updates.push(`duration_ms = $${params.length + 1}`);
    params.push(durationMs);
  }

  if (status === "retrying") {
    updates.push("retry_count = retry_count + 1");
  }

  params.push(batchId);

  const result = await pool.query(
    `UPDATE gateway.transmission_batches
     SET ${updates.join(", ")}
     WHERE id = $${params.length}
     RETURNING *`,
    params,
  );

  const batch = rowToBatch(result.rows[0] as Record<string, unknown>);

  const eventType: AuditEventType =
    status === "success" ? "transmission_success" : "transmission_failed";

  await logAuditEvent({
    event_type: eventType,
    target_type: "batch",
    target_id: batchId,
    details: {
      status,
      response_code: responseCode,
      duration_ms: durationMs,
    },
  });

  return batch;
}

/**
 * Get batch by ID
 */
export async function getBatchById(
  batchId: string,
): Promise<TransmissionBatch | null> {
  const result = await pool.query(
    "SELECT * FROM gateway.transmission_batches WHERE id = $1",
    [batchId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return rowToBatch(result.rows[0] as Record<string, unknown>);
}

/**
 * List transmission batches with pagination
 */
export async function listBatches(filters?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ batches: TransmissionBatchSummary[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters?.status) {
    conditions.push(`status = $${paramIndex++}`);
    params.push(filters.status);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM gateway.transmission_summary ${whereClause}`,
    params,
  );
  const total = parseInt(
    (countResult.rows[0] as Record<string, unknown>).count as string,
  );

  const limit = filters?.limit || 20;
  const offset = filters?.offset || 0;

  const result = await pool.query(
    `SELECT * FROM gateway.transmission_summary ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...params, limit, offset],
  );

  const batches = result.rows.map((row) =>
    rowToBatchSummary(row as Record<string, unknown>),
  );

  return { batches, total };
}

/**
 * Get items for a batch (summary view, no payload)
 */
export async function getBatchItems(
  batchId: string,
): Promise<TransmissionItemSummary[]> {
  const result = await pool.query(
    `SELECT id, batch_id, event_type, record_summary, payload_hash, redacted_fields, sequence_number, created_at
     FROM gateway.transmission_items
     WHERE batch_id = $1
     ORDER BY sequence_number`,
    [batchId],
  );

  return result.rows.map((row) =>
    rowToItemSummary(row as Record<string, unknown>),
  );
}

/**
 * Get full item payload (Admin only, logs access)
 */
export async function getItemPayload(
  itemId: string,
  accessedBy: string,
  accessIp?: string,
  accessReason?: string,
): Promise<TransmissionItem | null> {
  const result = await pool.query(
    "SELECT * FROM gateway.transmission_items WHERE id = $1",
    [itemId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  // Log the payload access
  await pool.query(
    `INSERT INTO gateway.payload_access_log (item_id, accessed_by, access_ip, access_reason)
     VALUES ($1, $2, $3, $4)`,
    [itemId, accessedBy, accessIp || null, accessReason || null],
  );

  await logAuditEvent({
    event_type: "payload_viewed",
    actor_id: accessedBy,
    target_type: "transmission_item",
    target_id: itemId,
    details: { access_reason: accessReason },
  });

  return rowToItem(result.rows[0] as Record<string, unknown>);
}

/**
 * Verify item payload integrity
 */
export async function verifyItemIntegrity(
  itemId: string,
): Promise<{ valid: boolean; stored_hash: string; computed_hash: string }> {
  const result = await pool.query(
    "SELECT payload, payload_hash FROM gateway.transmission_items WHERE id = $1",
    [itemId],
  );

  if (result.rows.length === 0) {
    throw new Error("Item not found");
  }

  const row = result.rows[0] as Record<string, unknown>;
  const storedHash = row.payload_hash as string;
  const payload = row.payload as Record<string, unknown>;
  const computedHash = computeHash(payload);

  return {
    valid: storedHash === computedHash,
    stored_hash: storedHash,
    computed_hash: computedHash,
  };
}

/**
 * Query audit log
 */
export async function queryAuditLog(filters?: {
  event_type?: AuditEventType;
  actor_id?: string;
  target_type?: string;
  target_id?: string;
  since?: Date;
  until?: Date;
  limit?: number;
  offset?: number;
}): Promise<{ entries: AuditLogEntry[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters?.event_type) {
    conditions.push(`event_type = $${paramIndex++}`);
    params.push(filters.event_type);
  }

  if (filters?.actor_id) {
    conditions.push(`actor_id = $${paramIndex++}`);
    params.push(filters.actor_id);
  }

  if (filters?.target_type) {
    conditions.push(`target_type = $${paramIndex++}`);
    params.push(filters.target_type);
  }

  if (filters?.target_id) {
    conditions.push(`target_id = $${paramIndex++}`);
    params.push(filters.target_id);
  }

  if (filters?.since) {
    conditions.push(`event_timestamp >= $${paramIndex++}`);
    params.push(filters.since.toISOString());
  }

  if (filters?.until) {
    conditions.push(`event_timestamp <= $${paramIndex++}`);
    params.push(filters.until.toISOString());
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM gateway.audit_log ${whereClause}`,
    params,
  );
  const total = parseInt(
    (countResult.rows[0] as Record<string, unknown>).count as string,
  );

  const limit = filters?.limit || 50;
  const offset = filters?.offset || 0;

  const result = await pool.query(
    `SELECT * FROM gateway.audit_log ${whereClause}
     ORDER BY event_timestamp DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...params, limit, offset],
  );

  const entries = result.rows.map((row) =>
    rowToAuditLog(row as Record<string, unknown>),
  );

  return { entries, total };
}

/**
 * Generate compliance export
 */
export async function generateComplianceExport(filters?: {
  since?: Date;
  until?: Date;
  batch_ids?: string[];
}): Promise<object> {
  // Get batches
  const batchConditions: string[] = [];
  const batchParams: unknown[] = [];
  let paramIndex = 1;

  if (filters?.since) {
    batchConditions.push(`created_at >= $${paramIndex++}`);
    batchParams.push(filters.since.toISOString());
  }

  if (filters?.until) {
    batchConditions.push(`created_at <= $${paramIndex++}`);
    batchParams.push(filters.until.toISOString());
  }

  if (filters?.batch_ids && filters.batch_ids.length > 0) {
    batchConditions.push(`id = ANY($${paramIndex++})`);
    batchParams.push(filters.batch_ids);
  }

  const batchWhere =
    batchConditions.length > 0 ? `WHERE ${batchConditions.join(" AND ")}` : "";

  const batchResult = await pool.query(
    `SELECT * FROM gateway.transmission_summary ${batchWhere} ORDER BY created_at`,
    batchParams,
  );

  const batches = batchResult.rows.map((row) =>
    rowToBatchSummary(row as Record<string, unknown>),
  );

  // Get items for each batch (summary only, no payloads in compliance export)
  const batchDetails = [];
  for (const batch of batches) {
    const items = await getBatchItems(batch.id);
    batchDetails.push({
      batch: {
        id: batch.id,
        batch_number: batch.batch_number,
        status: batch.status,
        item_count: batch.item_count,
        transmitted_at: batch.transmitted_at,
        batch_hash: batch.batch_hash,
      },
      items: items.map((item) => ({
        event_type: item.event_type,
        record_summary: item.record_summary,
        payload_hash: item.payload_hash,
        redacted_field_count: item.redacted_field_count,
      })),
    });
  }

  // Get audit log entries for the period
  const auditResult = await queryAuditLog({
    since: filters?.since,
    until: filters?.until,
    limit: 10000,
  });

  const exportData = {
    export_version: "1.0",
    export_date: new Date().toISOString(),
    export_type: "compliance",
    period: {
      from: filters?.since?.toISOString() || null,
      to: filters?.until?.toISOString() || null,
    },
    summary: {
      total_batches: batches.length,
      total_items: batches.reduce((sum, b) => sum + b.item_count, 0),
      successful_transmissions: batches.filter((b) => b.status === "success")
        .length,
      failed_transmissions: batches.filter((b) => b.status === "failed").length,
    },
    transmissions: batchDetails,
    audit_log_entries: auditResult.entries.length,
    audit_events_by_type: auditResult.entries.reduce(
      (acc, e) => {
        acc[e.event_type] = (acc[e.event_type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
  };

  // Log the export generation
  await logAuditEvent({
    event_type: "export_generated",
    details: {
      export_type: "compliance",
      batch_count: batches.length,
      period: exportData.period,
    },
  });

  return exportData;
}

/**
 * Purge old transmission data based on retention policy
 */
export async function purgeOldTransmissions(
  retentionDays: number = 90,
): Promise<number> {
  const result = await pool.query(
    "SELECT gateway.purge_old_transmissions($1)",
    [retentionDays],
  );
  return (result.rows[0] as Record<string, unknown>)
    .purge_old_transmissions as number;
}
