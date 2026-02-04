-- Migration: 009_optimize_scan_params.sql
-- Description: Reduce preset profile timeouts and add scan concurrency defaults
-- Reference: Network scanner speed optimization

-- Reduce timeout_seconds on preset profiles (old values were far too high for
-- their intended environments, causing multi-hour scans on dead hosts).
-- Also add max_concurrent_hosts and dead_host_threshold to advanced_settings.

-- Development: 10s → 3s, concurrency 10, threshold 5
UPDATE gateway.config_profiles
SET timeout_seconds = 3,
    advanced_settings = advanced_settings
        || '{"max_concurrent_hosts": 10, "dead_host_threshold": 5}'::jsonb
WHERE name = 'Development' AND profile_type = 'preset';

-- Small Business: 30s → 5s, concurrency 50, threshold 5
UPDATE gateway.config_profiles
SET timeout_seconds = 5,
    advanced_settings = advanced_settings
        || '{"max_concurrent_hosts": 50, "dead_host_threshold": 5}'::jsonb
WHERE name = 'Small Business' AND profile_type = 'preset';

-- Enterprise: 60s → 10s, concurrency 100, threshold 5
UPDATE gateway.config_profiles
SET timeout_seconds = 10,
    advanced_settings = advanced_settings
        || '{"max_concurrent_hosts": 100, "dead_host_threshold": 5}'::jsonb
WHERE name = 'Enterprise' AND profile_type = 'preset';

-- Air-Gapped: 45s → 10s, concurrency 25, threshold 7
-- Higher threshold to reduce false positives on high-latency isolated networks.
UPDATE gateway.config_profiles
SET timeout_seconds = 10,
    advanced_settings = advanced_settings
        || '{"max_concurrent_hosts": 25, "dead_host_threshold": 7}'::jsonb
WHERE name = 'Air-Gapped' AND profile_type = 'preset';
