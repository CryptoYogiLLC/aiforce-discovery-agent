import { Pool, PoolClient, QueryResult } from "pg";
import { config } from "../config";
import { logger } from "./logger";

// Shared pool instance for direct access
let sharedPool: Pool | null = null;

function getPool(): Pool {
  if (!sharedPool) {
    sharedPool = new Pool({
      host: config.database.host,
      port: config.database.port,
      user: config.database.user,
      password: config.database.password,
      database: config.database.database,
      ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
      max: config.database.poolSize,
    });
  }
  return sharedPool;
}

class Database {
  async connect(): Promise<void> {
    const pool = getPool();
    // Test connection
    const client = await pool.connect();
    client.release();
  }

  async disconnect(): Promise<void> {
    if (sharedPool) {
      await sharedPool.end();
      sharedPool = null;
    }
  }

  async isHealthy(): Promise<boolean> {
    if (!sharedPool) return false;
    try {
      const client = await sharedPool.connect();
      await client.query("SELECT 1");
      client.release();
      return true;
    } catch {
      return false;
    }
  }

  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    const pool = getPool();
    const result = await pool.query(sql, params);
    return result.rows;
  }

  async getClient(): Promise<PoolClient> {
    const pool = getPool();
    return pool.connect();
  }

  async migrate(): Promise<void> {
    const pool = getPool();

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
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        discovery_id UUID REFERENCES gateway.discoveries(id) ON DELETE CASCADE,
        event_type VARCHAR(100) NOT NULL,
        event_category VARCHAR(50) DEFAULT 'discovery',
        action VARCHAR(50),
        actor_id UUID,
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

    const client = await pool.connect();
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

// Export pool for direct access (used by session/user services)
export const pool = {
  query: async (sql: string, params?: unknown[]): Promise<QueryResult> => {
    const p = getPool();
    return p.query(sql, params);
  },
};
