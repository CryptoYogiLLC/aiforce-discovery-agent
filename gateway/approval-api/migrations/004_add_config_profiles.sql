-- Migration: 004_add_config_profiles.sql
-- Description: Add configuration profiles for discovery customization
-- Reference: ADR-005 Configuration Propagation Model, GitHub Issue #56

-- Profile types enum
DO $$ BEGIN
    CREATE TYPE gateway.profile_type AS ENUM ('preset', 'custom');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Configuration profiles table
CREATE TABLE IF NOT EXISTS gateway.config_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    profile_type gateway.profile_type NOT NULL DEFAULT 'custom',

    -- Network settings
    target_subnets JSONB NOT NULL DEFAULT '["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"]',
    port_ranges JSONB NOT NULL DEFAULT '{"tcp": "1-1024,3306,5432,6379,8080,8443", "udp": "53,161,500"}',
    scan_rate_limit INTEGER NOT NULL DEFAULT 100 CHECK (scan_rate_limit BETWEEN 1 AND 10000),

    -- Discovery limits
    max_services INTEGER NOT NULL DEFAULT 1000 CHECK (max_services BETWEEN 1 AND 100000),
    max_hosts INTEGER NOT NULL DEFAULT 500 CHECK (max_hosts BETWEEN 1 AND 50000),
    timeout_seconds INTEGER NOT NULL DEFAULT 30 CHECK (timeout_seconds BETWEEN 1 AND 300),

    -- Resource constraints
    disk_space_limit_mb INTEGER NOT NULL DEFAULT 10240 CHECK (disk_space_limit_mb BETWEEN 100 AND 102400),
    memory_limit_mb INTEGER NOT NULL DEFAULT 512 CHECK (memory_limit_mb BETWEEN 128 AND 8192),

    -- Collector selection
    enabled_collectors JSONB NOT NULL DEFAULT '["network-scanner", "code-analyzer", "db-inspector"]',

    -- Advanced settings
    advanced_settings JSONB DEFAULT '{}',

    -- Metadata
    created_by UUID REFERENCES gateway.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Preset profiles have special names
    CONSTRAINT unique_profile_name UNIQUE (name)
);

-- Scan configurations (records which profile was used for each scan)
CREATE TABLE IF NOT EXISTS gateway.scan_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id UUID NOT NULL, -- References the scan (from discovery service)
    profile_id UUID REFERENCES gateway.config_profiles(id) ON DELETE SET NULL,

    -- Snapshot of config at scan time (for audit)
    config_snapshot JSONB NOT NULL,

    -- Metadata
    started_by UUID REFERENCES gateway.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_config_profiles_type ON gateway.config_profiles(profile_type);
CREATE INDEX IF NOT EXISTS idx_config_profiles_created_by ON gateway.config_profiles(created_by);
CREATE INDEX IF NOT EXISTS idx_scan_configs_scan_id ON gateway.scan_configs(scan_id);
CREATE INDEX IF NOT EXISTS idx_scan_configs_profile_id ON gateway.scan_configs(profile_id);
CREATE INDEX IF NOT EXISTS idx_scan_configs_started_by ON gateway.scan_configs(started_by);

-- Trigger for updated_at
CREATE OR REPLACE TRIGGER update_config_profiles_updated_at
    BEFORE UPDATE ON gateway.config_profiles
    FOR EACH ROW
    EXECUTE FUNCTION gateway.update_updated_at_column();

-- Insert preset profiles (immutable)
INSERT INTO gateway.config_profiles (
    name, description, profile_type,
    target_subnets, port_ranges, scan_rate_limit,
    max_services, max_hosts, timeout_seconds,
    disk_space_limit_mb, memory_limit_mb,
    enabled_collectors, advanced_settings
) VALUES
-- Development preset
(
    'Development',
    'Minimal scanning for testing and demos. Scans limited subnet with common ports only.',
    'preset',
    '["192.168.1.0/24"]',
    '{"tcp": "22,80,443,3000,5432,8080", "udp": "53"}',
    10,
    5, 10, 10,
    1024, 256,
    '["network-scanner"]',
    '{"verbose": true, "skip_fingerprinting": false}'
),
-- Small Business preset
(
    'Small Business',
    'Balanced scanning for small deployments up to 100 services.',
    'preset',
    '["10.0.0.0/16", "192.168.0.0/16"]',
    '{"tcp": "1-1024,3306,5432,6379,8080,8443,27017", "udp": "53,161"}',
    50,
    100, 50, 30,
    5120, 512,
    '["network-scanner", "code-analyzer"]',
    '{"verbose": false, "skip_fingerprinting": false}'
),
-- Enterprise preset
(
    'Enterprise',
    'Full scanning for large environments with thousands of services.',
    'preset',
    '["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"]',
    '{"tcp": "1-65535", "udp": "53,67,68,69,123,161,162,500,514"}',
    100,
    10000, 5000, 60,
    20480, 1024,
    '["network-scanner", "code-analyzer", "db-inspector"]',
    '{"verbose": false, "skip_fingerprinting": false, "deep_inspection": true}'
),
-- Air-Gapped preset
(
    'Air-Gapped',
    'Optimized for isolated networks with no external connectivity.',
    'preset',
    '["10.0.0.0/8"]',
    '{"tcp": "1-1024,3306,5432,6379,8080,8443", "udp": "53,161"}',
    25,
    500, 200, 45,
    10240, 512,
    '["network-scanner", "code-analyzer", "db-inspector"]',
    '{"verbose": false, "skip_fingerprinting": false, "offline_mode": true}'
)
ON CONFLICT (name) DO NOTHING;

-- Grant permissions (skip if role doesn't exist in development)
DO $$ BEGIN
    GRANT SELECT, INSERT, UPDATE, DELETE ON gateway.config_profiles TO approval_api;
    GRANT SELECT, INSERT ON gateway.scan_configs TO approval_api;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA gateway TO approval_api;
EXCEPTION
    WHEN undefined_object THEN
        RAISE NOTICE 'Role approval_api does not exist, skipping grants';
END $$;
