-- Migration: 005_add_dryrun_tables.sql
-- Description: Add dry-run session and discovery tables (data partitioning)
-- Reference: ADR-004 Dry-Run Orchestration Model, ADR-006 Dry-Run Data Partitioning, GitHub Issue #57

-- Dry-run session status enum
DO $$ BEGIN
    CREATE TYPE gateway.dryrun_session_status AS ENUM (
        'pending',      -- Session created, waiting to start
        'generating',   -- Test environment being generated
        'running',      -- Collectors running against test environment
        'completed',    -- All collectors finished
        'failed',       -- Session failed with error
        'cleaning_up',  -- Cleanup in progress
        'cleaned'       -- Test environment removed
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Dry-run session discovery source enum
DO $$ BEGIN
    CREATE TYPE gateway.dryrun_discovery_source AS ENUM (
        'network-scanner',
        'code-analyzer',
        'db-inspector'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Dry-run session discovery status enum
DO $$ BEGIN
    CREATE TYPE gateway.dryrun_discovery_status AS ENUM (
        'pending',
        'approved',
        'rejected'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Dry-run sessions table
CREATE TABLE IF NOT EXISTS gateway.dryrun_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Configuration used for this dry-run
    profile_id UUID REFERENCES gateway.config_profiles(id) ON DELETE SET NULL,
    config_snapshot JSONB NOT NULL,

    -- Session status
    status gateway.dryrun_session_status NOT NULL DEFAULT 'pending',
    error_message TEXT,

    -- Test environment info
    container_count INTEGER DEFAULT 0,
    network_name VARCHAR(100),

    -- Timing
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    cleanup_at TIMESTAMP WITH TIME ZONE,

    -- Ownership
    started_by UUID REFERENCES gateway.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Dry-run discoveries table (SEPARATE from production discoveries)
-- Per ADR-006: Physical isolation ensures transmitter cannot access dry-run data
CREATE TABLE IF NOT EXISTS gateway.dryrun_discoveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Link to session (cascade delete for cleanup)
    session_id UUID NOT NULL REFERENCES gateway.dryrun_sessions(id) ON DELETE CASCADE,

    -- Discovery data
    source gateway.dryrun_discovery_source NOT NULL,
    discovery_type VARCHAR(50) NOT NULL,
    data JSONB NOT NULL,

    -- Approval practice
    status gateway.dryrun_discovery_status NOT NULL DEFAULT 'pending',
    reviewed_by UUID REFERENCES gateway.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    review_notes TEXT,

    -- Timestamps
    discovered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Dry-run container registry (for cleanup tracking)
CREATE TABLE IF NOT EXISTS gateway.dryrun_containers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES gateway.dryrun_sessions(id) ON DELETE CASCADE,
    container_id VARCHAR(64) NOT NULL, -- Docker container ID
    container_name VARCHAR(100) NOT NULL,
    service_type VARCHAR(50) NOT NULL, -- e.g., 'nginx', 'postgres', 'redis'
    image VARCHAR(200) NOT NULL,
    port_mappings JSONB DEFAULT '[]',
    status VARCHAR(20) NOT NULL DEFAULT 'running',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_dryrun_sessions_status ON gateway.dryrun_sessions(status);
CREATE INDEX IF NOT EXISTS idx_dryrun_sessions_started_by ON gateway.dryrun_sessions(started_by);
CREATE INDEX IF NOT EXISTS idx_dryrun_sessions_created_at ON gateway.dryrun_sessions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dryrun_discoveries_session ON gateway.dryrun_discoveries(session_id);
CREATE INDEX IF NOT EXISTS idx_dryrun_discoveries_status ON gateway.dryrun_discoveries(status);
CREATE INDEX IF NOT EXISTS idx_dryrun_discoveries_source ON gateway.dryrun_discoveries(source);

CREATE INDEX IF NOT EXISTS idx_dryrun_containers_session ON gateway.dryrun_containers(session_id);
CREATE INDEX IF NOT EXISTS idx_dryrun_containers_status ON gateway.dryrun_containers(status);

-- Trigger for updated_at
CREATE OR REPLACE TRIGGER update_dryrun_sessions_updated_at
    BEFORE UPDATE ON gateway.dryrun_sessions
    FOR EACH ROW
    EXECUTE FUNCTION gateway.update_updated_at_column();

-- Function to auto-cleanup old dry-run sessions (older than 24 hours)
CREATE OR REPLACE FUNCTION gateway.cleanup_old_dryrun_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete sessions that are marked as cleaned and older than 24 hours
    WITH deleted AS (
        DELETE FROM gateway.dryrun_sessions
        WHERE status = 'cleaned'
        AND cleanup_at < NOW() - INTERVAL '24 hours'
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted;

    RETURN deleted_count;
END;
$$;

-- View for dry-run session summaries
CREATE OR REPLACE VIEW gateway.dryrun_session_summary AS
SELECT
    s.id,
    s.status,
    s.profile_id,
    p.name as profile_name,
    s.container_count,
    s.started_by,
    u.username as started_by_username,
    s.started_at,
    s.completed_at,
    s.cleanup_at,
    s.created_at,
    COUNT(d.id) as discovery_count,
    COUNT(CASE WHEN d.status = 'approved' THEN 1 END) as approved_count,
    COUNT(CASE WHEN d.status = 'rejected' THEN 1 END) as rejected_count
FROM gateway.dryrun_sessions s
LEFT JOIN gateway.config_profiles p ON s.profile_id = p.id
LEFT JOIN gateway.users u ON s.started_by = u.id
LEFT JOIN gateway.dryrun_discoveries d ON s.id = d.session_id
GROUP BY s.id, p.name, u.username;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON gateway.dryrun_sessions TO approval_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON gateway.dryrun_discoveries TO approval_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON gateway.dryrun_containers TO approval_api;
GRANT SELECT ON gateway.dryrun_session_summary TO approval_api;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA gateway TO approval_api;
