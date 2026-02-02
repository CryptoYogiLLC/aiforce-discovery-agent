-- Migration: 006_add_audit_trail.sql
-- Description: Add comprehensive audit trail and transmission history
-- Reference: GitHub Issue #59

-- Audit event types enum
DO $$ BEGIN
    CREATE TYPE gateway.audit_event_type AS ENUM (
        'discovery_received',
        'discovery_approved',
        'discovery_rejected',
        'batch_created',
        'transmission_success',
        'transmission_failed',
        'pii_redacted',
        'payload_viewed',
        'config_changed',
        'user_login',
        'user_logout',
        'password_changed',
        'session_created',
        'session_destroyed',
        'profile_created',
        'profile_updated',
        'profile_deleted',
        'dryrun_started',
        'dryrun_completed',
        'export_generated'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Transmission status enum
DO $$ BEGIN
    CREATE TYPE gateway.transmission_status AS ENUM (
        'pending',
        'in_progress',
        'success',
        'failed',
        'retrying'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Transmission batches table
CREATE TABLE IF NOT EXISTS gateway.transmission_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_number SERIAL,
    status gateway.transmission_status NOT NULL DEFAULT 'pending',

    -- Batch contents
    item_count INTEGER NOT NULL DEFAULT 0,
    total_size_bytes BIGINT DEFAULT 0,

    -- Transmission details
    transmitted_at TIMESTAMP WITH TIME ZONE,
    response_code INTEGER,
    response_message TEXT,
    duration_ms INTEGER,
    retry_count INTEGER DEFAULT 0,

    -- Verification
    batch_hash VARCHAR(64), -- SHA-256 of canonical JSON

    -- Metadata
    created_by UUID REFERENCES gateway.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Transmission items (individual records in a batch)
CREATE TABLE IF NOT EXISTS gateway.transmission_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES gateway.transmission_batches(id) ON DELETE CASCADE,
    discovery_id UUID, -- Reference to original discovery if applicable

    -- Record details
    event_type VARCHAR(100) NOT NULL,
    record_summary VARCHAR(500),

    -- Payload (encrypted at rest via TDE or application-level)
    payload JSONB NOT NULL,
    payload_hash VARCHAR(64) NOT NULL, -- SHA-256 for integrity verification

    -- PII tracking
    redacted_fields JSONB DEFAULT '[]', -- List of redacted field paths
    redaction_reasons JSONB DEFAULT '{}', -- Map of field -> reason

    -- Sequence
    sequence_number INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Comprehensive audit log (append-only)
CREATE TABLE IF NOT EXISTS gateway.audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type gateway.audit_event_type NOT NULL,
    event_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Actor
    actor_id UUID REFERENCES gateway.users(id) ON DELETE SET NULL,
    actor_username VARCHAR(100),
    actor_ip VARCHAR(45),

    -- Target
    target_type VARCHAR(50), -- e.g., 'discovery', 'user', 'batch', 'profile'
    target_id VARCHAR(100),

    -- Event details
    details JSONB NOT NULL DEFAULT '{}',

    -- Append-only enforcement (no updates allowed)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payload access log (tracks who viewed full payloads)
CREATE TABLE IF NOT EXISTS gateway.payload_access_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES gateway.transmission_items(id) ON DELETE CASCADE,
    accessed_by UUID NOT NULL REFERENCES gateway.users(id) ON DELETE SET NULL,
    accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    access_ip VARCHAR(45),
    access_reason TEXT
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_transmission_batches_status ON gateway.transmission_batches(status);
CREATE INDEX IF NOT EXISTS idx_transmission_batches_created_at ON gateway.transmission_batches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transmission_batches_created_by ON gateway.transmission_batches(created_by);

CREATE INDEX IF NOT EXISTS idx_transmission_items_batch ON gateway.transmission_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_transmission_items_discovery ON gateway.transmission_items(discovery_id);
CREATE INDEX IF NOT EXISTS idx_transmission_items_event_type ON gateway.transmission_items(event_type);

CREATE INDEX IF NOT EXISTS idx_audit_log_event_type ON gateway.audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON gateway.audit_log(event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON gateway.audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_target ON gateway.audit_log(target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_payload_access_item ON gateway.payload_access_log(item_id);
CREATE INDEX IF NOT EXISTS idx_payload_access_by ON gateway.payload_access_log(accessed_by);

-- Trigger for updated_at on batches
CREATE OR REPLACE TRIGGER update_transmission_batches_updated_at
    BEFORE UPDATE ON gateway.transmission_batches
    FOR EACH ROW
    EXECUTE FUNCTION gateway.update_updated_at_column();

-- Prevent updates/deletes on audit_log (append-only)
CREATE OR REPLACE FUNCTION gateway.prevent_audit_log_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Audit log is append-only. Modifications are not allowed.';
END;
$$;

DROP TRIGGER IF EXISTS prevent_audit_log_update ON gateway.audit_log;
CREATE TRIGGER prevent_audit_log_update
    BEFORE UPDATE OR DELETE ON gateway.audit_log
    FOR EACH ROW
    EXECUTE FUNCTION gateway.prevent_audit_log_modification();

-- Function to purge old transmission data (retention policy)
CREATE OR REPLACE FUNCTION gateway.purge_old_transmissions(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete batches older than retention period
    WITH deleted AS (
        DELETE FROM gateway.transmission_batches
        WHERE created_at < NOW() - (retention_days || ' days')::INTERVAL
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted;

    RETURN deleted_count;
END;
$$;

-- View for transmission summary
CREATE OR REPLACE VIEW gateway.transmission_summary AS
SELECT
    b.id,
    b.batch_number,
    b.status,
    b.item_count,
    b.total_size_bytes,
    b.transmitted_at,
    b.response_code,
    b.duration_ms,
    b.retry_count,
    b.batch_hash,
    b.created_by,
    u.username as created_by_username,
    b.created_at
FROM gateway.transmission_batches b
LEFT JOIN gateway.users u ON b.created_by = u.id;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON gateway.transmission_batches TO approval_api;
GRANT SELECT, INSERT ON gateway.transmission_items TO approval_api;
GRANT SELECT, INSERT ON gateway.audit_log TO approval_api;
GRANT SELECT, INSERT ON gateway.payload_access_log TO approval_api;
GRANT SELECT ON gateway.transmission_summary TO approval_api;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA gateway TO approval_api;
