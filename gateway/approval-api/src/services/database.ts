import { Pool, PoolClient } from "pg";
import { config } from "../config";
import { logger } from "./logger";

class Database {
  private pool: Pool | null = null;

  async connect(): Promise<void> {
    this.pool = new Pool({
      host: config.database.host,
      port: config.database.port,
      user: config.database.user,
      password: config.database.password,
      database: config.database.database,
      ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
      max: config.database.poolSize,
    });

    // Test connection
    const client = await this.pool.connect();
    client.release();
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  async isHealthy(): Promise<boolean> {
    if (!this.pool) return false;
    try {
      const client = await this.pool.connect();
      await client.query("SELECT 1");
      client.release();
      return true;
    } catch {
      return false;
    }
  }

  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    if (!this.pool) throw new Error("Database not connected");
    const result = await this.pool.query(sql, params);
    return result.rows;
  }

  async getClient(): Promise<PoolClient> {
    if (!this.pool) throw new Error("Database not connected");
    return this.pool.connect();
  }

  async migrate(): Promise<void> {
    if (!this.pool) throw new Error("Database not connected");

    const migrations = [
      // Create schema
      `CREATE SCHEMA IF NOT EXISTS gateway;`,

      // Discoveries table
      `CREATE TABLE IF NOT EXISTS gateway.discoveries (
        id UUID PRIMARY KEY,
        event_type VARCHAR(100) NOT NULL,
        source_service VARCHAR(50) NOT NULL,
        payload JSONB NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        reviewed_by VARCHAR(100),
        reviewed_at TIMESTAMP,
        rejection_reason TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );`,

      // Audit log table
      `CREATE TABLE IF NOT EXISTS gateway.audit_log (
        id UUID PRIMARY KEY,
        discovery_id UUID REFERENCES gateway.discoveries(id) ON DELETE CASCADE,
        action VARCHAR(50) NOT NULL,
        actor VARCHAR(100),
        details JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );`,

      // Indexes
      `CREATE INDEX IF NOT EXISTS idx_discoveries_status ON gateway.discoveries(status);`,
      `CREATE INDEX IF NOT EXISTS idx_discoveries_created_at ON gateway.discoveries(created_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_discoveries_source ON gateway.discoveries(source_service);`,
      `CREATE INDEX IF NOT EXISTS idx_audit_discovery ON gateway.audit_log(discovery_id);`,
    ];

    const client = await this.pool.connect();
    try {
      for (const sql of migrations) {
        await client.query(sql);
      }
      logger.info("Database migrations applied successfully");
    } finally {
      client.release();
    }
  }
}

export const db = new Database();
