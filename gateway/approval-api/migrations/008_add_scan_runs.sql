-- Migration: 008_add_scan_runs.sql
-- Description: Add scan run orchestration tables for autonomous discovery
-- Reference: ADR-007 Discovery Acquisition Model, GitHub Issue #108

-- Scan run status enum (lifecycle states per ADR-007)
DO $$ BEGIN
    CREATE TYPE gateway.scan_run_status AS ENUM (
        'pending',              -- Created, waiting to start
        'scanning',             -- Active scanning in progress
        'awaiting_inspection',  -- Scanning complete, awaiting deep inspection
        'inspecting',           -- Deep inspection (DB credentials) in progress
        'completed',            -- All phases complete
        'failed',               -- Scan failed with error
        'cancelled'             -- Scan cancelled by user
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Collector status enum (individual collector state)
DO $$ BEGIN
    CREATE TYPE gateway.collector_status AS ENUM (
        'pending',   -- Waiting to start
        'starting',  -- Initializing
        'running',   -- Actively collecting
        'completed', -- Finished successfully
        'failed',    -- Failed with error
        'timeout'    -- Exceeded time limit
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Main scan runs table (canonical orchestration lifecycle)
CREATE TABLE IF NOT EXISTS gateway.scan_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Configuration reference
    profile_id UUID REFERENCES gateway.config_profiles(id) ON DELETE SET NULL,
    config_snapshot JSONB NOT NULL, -- Frozen config at scan start time

    -- Status tracking
    status gateway.scan_run_status NOT NULL DEFAULT 'pending',
    error_message TEXT,

    -- Phase progress tracking (ADR-007 phases)
    phases JSONB NOT NULL DEFAULT '{
        "enumeration": {"status": "pending", "progress": 0, "discovery_count": 0},
        "identification": {"status": "pending", "progress": 0, "discovery_count": 0},
        "inspection": {"status": "pending", "progress": 0, "discovery_count": 0},
        "correlation": {"status": "pending", "progress": 0, "discovery_count": 0}
    }',

    -- Aggregate counters
    total_discoveries INTEGER DEFAULT 0,

    -- Timing
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,

    -- Ownership
    started_by UUID REFERENCES gateway.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Collector status tracking (with sequence for idempotency)
CREATE TABLE IF NOT EXISTS gateway.scan_collectors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id UUID NOT NULL REFERENCES gateway.scan_runs(id) ON DELETE CASCADE,
    collector_name VARCHAR(50) NOT NULL, -- e.g., 'network-scanner', 'code-analyzer', 'db-inspector'

    -- Status tracking
    status gateway.collector_status NOT NULL DEFAULT 'pending',
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    discovery_count INTEGER DEFAULT 0,

    -- Idempotency: monotonic sequence counter (ADR-007)
    -- Progress updates only accepted if sequence > last_sequence
    last_sequence INTEGER DEFAULT 0,

    -- Error tracking
    error_message TEXT,

    -- Timing
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    last_heartbeat_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Ensure one record per collector per scan
    CONSTRAINT unique_scan_collector UNIQUE (scan_id, collector_name)
);

-- Add FK constraint from discoveries.scan_id to scan_runs
-- (scan_id column added in migration 007)
DO $$ BEGIN
    ALTER TABLE gateway.discoveries
        ADD CONSTRAINT fk_discoveries_scan_id
        FOREIGN KEY (scan_id) REFERENCES gateway.scan_runs(id) ON DELETE SET NULL;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Add FK constraint from dryrun_discoveries.scan_id to scan_runs
DO $$ BEGIN
    ALTER TABLE gateway.dryrun_discoveries
        ADD CONSTRAINT fk_dryrun_discoveries_scan_id
        FOREIGN KEY (scan_id) REFERENCES gateway.scan_runs(id) ON DELETE SET NULL;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_scan_runs_status ON gateway.scan_runs(status);
CREATE INDEX IF NOT EXISTS idx_scan_runs_created_at ON gateway.scan_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_runs_profile_id ON gateway.scan_runs(profile_id);
CREATE INDEX IF NOT EXISTS idx_scan_runs_started_by ON gateway.scan_runs(started_by);

CREATE INDEX IF NOT EXISTS idx_scan_collectors_scan_id ON gateway.scan_collectors(scan_id);
CREATE INDEX IF NOT EXISTS idx_scan_collectors_status ON gateway.scan_collectors(status);

-- JSONB indexes for candidate flags in payload.metadata (ADR-007)
-- Note: Uses 'payload' column per runtime code (renamed from 'data' in migration 007)
CREATE INDEX IF NOT EXISTS idx_discoveries_db_candidate
    ON gateway.discoveries ((payload->'metadata'->>'database_candidate'))
    WHERE payload->'metadata'->>'database_candidate' = 'true';

CREATE INDEX IF NOT EXISTS idx_discoveries_candidate_confidence
    ON gateway.discoveries ((payload->'metadata'->>'candidate_confidence'))
    WHERE payload->'metadata'->>'database_candidate' = 'true';

-- Trigger for updated_at on scan_runs
CREATE OR REPLACE TRIGGER update_scan_runs_updated_at
    BEFORE UPDATE ON gateway.scan_runs
    FOR EACH ROW
    EXECUTE FUNCTION gateway.update_updated_at_column();

-- View for scan run summaries
CREATE OR REPLACE VIEW gateway.scan_run_summary AS
SELECT
    s.id,
    s.status,
    s.profile_id,
    p.name as profile_name,
    s.total_discoveries,
    s.started_by,
    u.username as started_by_username,
    s.started_at,
    s.completed_at,
    s.created_at,
    s.phases,
    COUNT(DISTINCT c.id) as collector_count,
    COUNT(DISTINCT CASE WHEN c.status = 'completed' THEN c.id END) as completed_collectors
FROM gateway.scan_runs s
LEFT JOIN gateway.config_profiles p ON s.profile_id = p.id
LEFT JOIN gateway.users u ON s.started_by = u.id
LEFT JOIN gateway.scan_collectors c ON s.id = c.scan_id
GROUP BY s.id, p.name, u.username;

-- Grant permissions (skip if role doesn't exist in development)
DO $$ BEGIN
    GRANT SELECT, INSERT, UPDATE, DELETE ON gateway.scan_runs TO approval_api;
    GRANT SELECT, INSERT, UPDATE, DELETE ON gateway.scan_collectors TO approval_api;
    GRANT SELECT ON gateway.scan_run_summary TO approval_api;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA gateway TO approval_api;
EXCEPTION
    WHEN undefined_object THEN
        RAISE NOTICE 'Role approval_api does not exist, skipping grants';
END $$;
