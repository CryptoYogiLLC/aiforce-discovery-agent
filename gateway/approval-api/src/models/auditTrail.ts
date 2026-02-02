/**
 * Audit Trail and Transmission History models
 * Reference: GitHub Issue #59
 */

export type TransmissionStatus =
  | "pending"
  | "in_progress"
  | "success"
  | "failed"
  | "retrying";

export type AuditEventType =
  | "discovery_received"
  | "discovery_approved"
  | "discovery_rejected"
  | "batch_created"
  | "transmission_success"
  | "transmission_failed"
  | "pii_redacted"
  | "payload_viewed"
  | "config_changed"
  | "user_login"
  | "user_logout"
  | "password_changed"
  | "session_created"
  | "session_destroyed"
  | "profile_created"
  | "profile_updated"
  | "profile_deleted"
  | "dryrun_started"
  | "dryrun_completed"
  | "export_generated";

export interface TransmissionBatch {
  id: string;
  batch_number: number;
  status: TransmissionStatus;
  item_count: number;
  total_size_bytes: number;
  transmitted_at: Date | null;
  response_code: number | null;
  response_message: string | null;
  duration_ms: number | null;
  retry_count: number;
  batch_hash: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface TransmissionBatchSummary extends TransmissionBatch {
  created_by_username: string | null;
}

export interface TransmissionItem {
  id: string;
  batch_id: string;
  discovery_id: string | null;
  event_type: string;
  record_summary: string | null;
  payload: Record<string, unknown>;
  payload_hash: string;
  redacted_fields: string[];
  redaction_reasons: Record<string, string>;
  sequence_number: number;
  created_at: Date;
}

export interface TransmissionItemSummary {
  id: string;
  batch_id: string;
  event_type: string;
  record_summary: string | null;
  payload_hash: string;
  redacted_field_count: number;
  sequence_number: number;
  created_at: Date;
}

export interface AuditLogEntry {
  id: string;
  event_type: AuditEventType;
  event_timestamp: Date;
  actor_id: string | null;
  actor_username: string | null;
  actor_ip: string | null;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown>;
  created_at: Date;
}

export interface PayloadAccessLog {
  id: string;
  item_id: string;
  accessed_by: string;
  accessed_at: Date;
  access_ip: string | null;
  access_reason: string | null;
}

export interface CreateBatchInput {
  items: CreateItemInput[];
}

export interface CreateItemInput {
  discovery_id?: string;
  event_type: string;
  record_summary?: string;
  payload: Record<string, unknown>;
  redacted_fields?: string[];
  redaction_reasons?: Record<string, string>;
}

export interface LogEventInput {
  event_type: AuditEventType;
  actor_id?: string;
  actor_username?: string;
  actor_ip?: string;
  target_type?: string;
  target_id?: string;
  details?: Record<string, unknown>;
}

// Convert database row to TransmissionBatch
export function rowToBatch(row: Record<string, unknown>): TransmissionBatch {
  return {
    id: row.id as string,
    batch_number: row.batch_number as number,
    status: row.status as TransmissionStatus,
    item_count: row.item_count as number,
    total_size_bytes: parseInt(row.total_size_bytes as string) || 0,
    transmitted_at: row.transmitted_at
      ? new Date(row.transmitted_at as string)
      : null,
    response_code: row.response_code as number | null,
    response_message: row.response_message as string | null,
    duration_ms: row.duration_ms as number | null,
    retry_count: row.retry_count as number,
    batch_hash: row.batch_hash as string | null,
    created_by: row.created_by as string | null,
    created_at: new Date(row.created_at as string),
    updated_at: new Date(row.updated_at as string),
  };
}

export function rowToBatchSummary(
  row: Record<string, unknown>,
): TransmissionBatchSummary {
  return {
    ...rowToBatch(row),
    created_by_username: row.created_by_username as string | null,
  };
}

export function rowToItem(row: Record<string, unknown>): TransmissionItem {
  return {
    id: row.id as string,
    batch_id: row.batch_id as string,
    discovery_id: row.discovery_id as string | null,
    event_type: row.event_type as string,
    record_summary: row.record_summary as string | null,
    payload: row.payload as Record<string, unknown>,
    payload_hash: row.payload_hash as string,
    redacted_fields: row.redacted_fields as string[],
    redaction_reasons: row.redaction_reasons as Record<string, string>,
    sequence_number: row.sequence_number as number,
    created_at: new Date(row.created_at as string),
  };
}

export function rowToItemSummary(
  row: Record<string, unknown>,
): TransmissionItemSummary {
  const redactedFields = row.redacted_fields as string[];
  return {
    id: row.id as string,
    batch_id: row.batch_id as string,
    event_type: row.event_type as string,
    record_summary: row.record_summary as string | null,
    payload_hash: row.payload_hash as string,
    redacted_field_count: redactedFields?.length || 0,
    sequence_number: row.sequence_number as number,
    created_at: new Date(row.created_at as string),
  };
}

export function rowToAuditLog(row: Record<string, unknown>): AuditLogEntry {
  return {
    id: row.id as string,
    event_type: row.event_type as AuditEventType,
    event_timestamp: new Date(row.event_timestamp as string),
    actor_id: row.actor_id as string | null,
    actor_username: row.actor_username as string | null,
    actor_ip: row.actor_ip as string | null,
    target_type: row.target_type as string | null,
    target_id: row.target_id as string | null,
    details: row.details as Record<string, unknown>,
    created_at: new Date(row.created_at as string),
  };
}

export function rowToPayloadAccess(
  row: Record<string, unknown>,
): PayloadAccessLog {
  return {
    id: row.id as string,
    item_id: row.item_id as string,
    accessed_by: row.accessed_by as string,
    accessed_at: new Date(row.accessed_at as string),
    access_ip: row.access_ip as string | null,
    access_reason: row.access_reason as string | null,
  };
}
