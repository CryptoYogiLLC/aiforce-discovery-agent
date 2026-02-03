-- Migration: 001_init_schema.sql
-- Description: Initialize gateway schema and base tables
-- Reference: Foundation setup

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create discoveries table (base table for discovered items)
CREATE TABLE IF NOT EXISTS gateway.discoveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source VARCHAR(50) NOT NULL,
    type VARCHAR(50) NOT NULL,
    data JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    reviewed_by VARCHAR(100),
    reviewed_at TIMESTAMP,
    review_notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for discoveries
CREATE INDEX IF NOT EXISTS idx_discoveries_source ON gateway.discoveries(source);
CREATE INDEX IF NOT EXISTS idx_discoveries_type ON gateway.discoveries(type);
CREATE INDEX IF NOT EXISTS idx_discoveries_status ON gateway.discoveries(status);
CREATE INDEX IF NOT EXISTS idx_discoveries_created_at ON gateway.discoveries(created_at);

-- Create audit_log table for tracking actions
CREATE TABLE IF NOT EXISTS gateway.audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discovery_id UUID REFERENCES gateway.discoveries(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    actor VARCHAR(100),
    details JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for audit_log
CREATE INDEX IF NOT EXISTS idx_audit_discovery ON gateway.audit_log(discovery_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON gateway.audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON gateway.audit_log(created_at);

-- Create migrations tracking table
CREATE TABLE IF NOT EXISTS gateway.migrations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    applied_at TIMESTAMP DEFAULT NOW()
);
