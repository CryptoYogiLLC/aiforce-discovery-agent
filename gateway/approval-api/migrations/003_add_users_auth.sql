-- Migration: Add users, sessions, and role_permissions tables for RBAC
-- Reference: ADR-003 Session Security Model, GitHub Issue #61

-- Users table
CREATE TABLE IF NOT EXISTS gateway.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'viewer',
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMP,
    password_changed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    CONSTRAINT valid_role CHECK (role IN ('admin', 'operator', 'viewer'))
);

CREATE INDEX IF NOT EXISTS idx_users_username ON gateway.users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON gateway.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON gateway.users(role);

-- Sessions table (server-side session storage per ADR-003)
CREATE TABLE IF NOT EXISTS gateway.sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES gateway.users(id) ON DELETE CASCADE,
    csrf_token VARCHAR(64) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),

    CONSTRAINT valid_expiry CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON gateway.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON gateway.sessions(expires_at);

-- Recovery codes for air-gapped password reset (no email dependency)
CREATE TABLE IF NOT EXISTS gateway.recovery_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES gateway.users(id) ON DELETE CASCADE,
    code_hash VARCHAR(255) NOT NULL,
    created_by UUID REFERENCES gateway.users(id) ON DELETE SET NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),

    CONSTRAINT valid_expiry CHECK (expires_at > created_at),
    CONSTRAINT single_use CHECK (used_at IS NULL OR used_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_recovery_codes_user_id ON gateway.recovery_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_recovery_codes_expires ON gateway.recovery_codes(expires_at);

-- Role permissions table (for future extensibility)
CREATE TABLE IF NOT EXISTS gateway.role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role VARCHAR(20) NOT NULL,
    permission VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(role, permission),
    CONSTRAINT valid_role CHECK (role IN ('admin', 'operator', 'viewer'))
);

-- Seed default permissions
INSERT INTO gateway.role_permissions (role, permission) VALUES
    -- Admin permissions
    ('admin', 'users.create'),
    ('admin', 'users.read'),
    ('admin', 'users.update'),
    ('admin', 'users.delete'),
    ('admin', 'profiles.manage'),
    ('admin', 'discoveries.read'),
    ('admin', 'discoveries.approve'),
    ('admin', 'discoveries.reject'),
    ('admin', 'dryrun.execute'),
    ('admin', 'audit.read'),
    ('admin', 'dashboard.read'),
    -- Operator permissions
    ('operator', 'discoveries.read'),
    ('operator', 'discoveries.approve'),
    ('operator', 'discoveries.reject'),
    ('operator', 'dryrun.execute'),
    ('operator', 'audit.read'),
    ('operator', 'dashboard.read'),
    -- Viewer permissions
    ('viewer', 'discoveries.read'),
    ('viewer', 'audit.read'),
    ('viewer', 'dashboard.read')
ON CONFLICT (role, permission) DO NOTHING;

-- Extend audit_log for auth events
ALTER TABLE gateway.audit_log
ADD COLUMN IF NOT EXISTS event_category VARCHAR(50) DEFAULT 'discovery';

-- Create default admin user with LOCKED password (invalid hash that won't authenticate)
-- IMPORTANT: This user CANNOT log in until password is set via seed script or CLI
-- The placeholder hash is intentionally invalid to prevent any default password authentication
INSERT INTO gateway.users (username, email, password_hash, role)
VALUES (
    'admin',
    'admin@localhost',
    '$argon2id$v=19$m=65536,t=3,p=4$INVALID$LOCKED_ACCOUNT_RUN_SEED_SCRIPT',
    'admin'
) ON CONFLICT (username) DO NOTHING;

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION gateway.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for users table
DROP TRIGGER IF EXISTS update_users_updated_at ON gateway.users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON gateway.users
    FOR EACH ROW
    EXECUTE FUNCTION gateway.update_updated_at_column();

-- Clean up expired sessions (run periodically via cron or app logic)
CREATE OR REPLACE FUNCTION gateway.cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM gateway.sessions WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ language 'plpgsql';
