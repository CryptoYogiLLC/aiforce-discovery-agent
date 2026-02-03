-- Migration: 007_fix_discoveries_schema.sql
-- Description: Align discoveries table columns with runtime code (Option A - lowest risk)
-- Reference: ADR-007 Discovery Acquisition Model - Schema Drift Fix

-- Problem: Migration 001 created columns: source, type, data
--          Runtime code (consumer.ts, discovery.ts) uses: source_service, event_type, payload
--          This migration renames columns to match the runtime code.

-- Step 1: Rename columns in discoveries table to match TypeScript code expectations
ALTER TABLE gateway.discoveries RENAME COLUMN source TO source_service;
ALTER TABLE gateway.discoveries RENAME COLUMN type TO event_type;
ALTER TABLE gateway.discoveries RENAME COLUMN data TO payload;

-- Step 2: Drop old indexes (they reference old column names)
DROP INDEX IF EXISTS gateway.idx_discoveries_source;
DROP INDEX IF EXISTS gateway.idx_discoveries_type;

-- Step 3: Create new indexes with correct column names
CREATE INDEX IF NOT EXISTS idx_discoveries_source_service ON gateway.discoveries(source_service);
CREATE INDEX IF NOT EXISTS idx_discoveries_event_type ON gateway.discoveries(event_type);

-- Step 4: Add scan_id column for orchestration tracking (ADR-007)
-- Note: scan_runs table will be created in migration 008, so we add the column here
-- as a plain UUID without FK constraint. The FK will be added in migration 008.
ALTER TABLE gateway.discoveries
    ADD COLUMN IF NOT EXISTS scan_id UUID;

-- Step 5: Create index for filtering discoveries by scan
CREATE INDEX IF NOT EXISTS idx_discoveries_scan_id ON gateway.discoveries(scan_id)
    WHERE scan_id IS NOT NULL;

-- Step 6: Add scan_id to dryrun_discoveries for ADR-006 isolation
-- Note: dryrun_discoveries has different column names (uses ENUMs), we only add scan_id
ALTER TABLE gateway.dryrun_discoveries
    ADD COLUMN IF NOT EXISTS scan_id UUID;

-- Step 7: Create index for filtering dryrun discoveries by scan
CREATE INDEX IF NOT EXISTS idx_dryrun_discoveries_scan_id ON gateway.dryrun_discoveries(scan_id)
    WHERE scan_id IS NOT NULL;

-- Grant permissions (skip if role doesn't exist in development)
DO $$ BEGIN
    GRANT SELECT, INSERT, UPDATE, DELETE ON gateway.discoveries TO approval_api;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA gateway TO approval_api;
EXCEPTION
    WHEN undefined_object THEN
        RAISE NOTICE 'Role approval_api does not exist, skipping grants';
END $$;
