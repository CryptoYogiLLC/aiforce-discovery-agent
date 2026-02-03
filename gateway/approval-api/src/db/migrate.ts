/**
 * Database migration runner
 * Runs SQL migrations in order
 */

import fs from "fs";
import path from "path";
import { pool } from "../services/database";
import { logger } from "../services/logger";
import argon2 from "argon2";

const MIGRATIONS_DIR = path.join(__dirname, "../../migrations");

// Migration record type (for reference)
// interface Migration {
//   name: string;
//   applied_at: Date;
// }

/**
 * Ensure migrations table exists
 */
async function ensureMigrationsTable(): Promise<void> {
  // Create schema first if it doesn't exist
  await pool.query(`CREATE SCHEMA IF NOT EXISTS gateway`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS gateway.migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

/**
 * Get list of applied migrations
 */
async function getAppliedMigrations(): Promise<string[]> {
  const result = await pool.query(
    "SELECT name FROM gateway.migrations ORDER BY id",
  );
  return result.rows.map(
    (row) => (row as Record<string, unknown>).name as string,
  );
}

/**
 * Mark migration as applied
 */
async function markMigrationApplied(name: string): Promise<void> {
  await pool.query("INSERT INTO gateway.migrations (name) VALUES ($1)", [name]);
}

/**
 * Get pending migrations
 */
async function getPendingMigrations(): Promise<string[]> {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    logger.warn("Migrations directory not found", { path: MIGRATIONS_DIR });
    return [];
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied = await getAppliedMigrations();
  return files.filter((f) => !applied.includes(f));
}

/**
 * Run a single migration
 */
async function runMigration(filename: string): Promise<void> {
  const filepath = path.join(MIGRATIONS_DIR, filename);
  const sql = fs.readFileSync(filepath, "utf8");

  logger.info("Running migration", { migration: filename });

  await pool.query(sql);
  await markMigrationApplied(filename);

  logger.info("Migration completed", { migration: filename });
}

/**
 * Seed default admin user with proper password hash
 */
async function seedDefaultAdmin(): Promise<void> {
  const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD;

  if (!defaultPassword) {
    logger.warn(
      "DEFAULT_ADMIN_PASSWORD not set - admin user will not be seeded. " +
        "Set DEFAULT_ADMIN_PASSWORD environment variable to create admin user.",
    );
    return;
  }

  if (defaultPassword.length < 12) {
    logger.error(
      "DEFAULT_ADMIN_PASSWORD must be at least 12 characters for security",
    );
    return;
  }

  // Check if admin exists with placeholder hash
  const result = await pool.query(
    "SELECT id, password_hash FROM gateway.users WHERE username = 'admin'",
  );

  // Placeholder hashes used in migration files (locked account markers)
  const placeholderPatterns = [
    "$argon2id$v=19$m=65536,t=3,p=4$placeholder$placeholder",
    "$argon2id$v=19$m=65536,t=3,p=4$INVALID$LOCKED_ACCOUNT_RUN_SEED_SCRIPT",
  ];

  if (result.rows.length === 0) {
    // Admin doesn't exist, create it
    const passwordHash = await argon2.hash(defaultPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    await pool.query(
      `INSERT INTO gateway.users (username, email, password_hash, role)
       VALUES ('admin', 'admin@localhost', $1, 'admin')`,
      [passwordHash],
    );
    logger.info("Default admin user created");
  } else {
    const storedHash = (result.rows[0] as Record<string, unknown>)
      .password_hash as string;

    // Check if stored hash is any of the placeholder patterns (locked account)
    const isPlaceholder = placeholderPatterns.some((p) => storedHash === p);

    if (isPlaceholder) {
      // Update placeholder hash with real one
      const passwordHash = await argon2.hash(defaultPassword, {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });

      await pool.query(
        "UPDATE gateway.users SET password_hash = $1 WHERE username = 'admin'",
        [passwordHash],
      );
      logger.info("Default admin password hash updated");
    }
  }
}

/**
 * Run all pending migrations
 */
export async function runMigrations(): Promise<void> {
  try {
    await ensureMigrationsTable();

    const pending = await getPendingMigrations();

    if (pending.length === 0) {
      logger.info("No pending migrations");
    } else {
      logger.info("Running migrations", { count: pending.length });

      for (const migration of pending) {
        await runMigration(migration);
      }

      logger.info("All migrations completed");
    }

    // Always check if admin needs seeding (even if no migrations ran)
    await seedDefaultAdmin();
  } catch (err) {
    logger.error("Migration failed", { error: (err as Error).message });
    throw err;
  }
}

// Run migrations if executed directly
if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
