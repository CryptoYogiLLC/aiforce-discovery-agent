/**
 * Dry-Run Cleanup Service
 *
 * Handles automatic cleanup of stale dry-run sessions:
 * - Sessions running longer than 30 minutes
 * - Failed sessions that need container cleanup
 *
 * Reference: ADR-004 Dry-Run Orchestration Model, GitHub Issue #71
 */

import { pool } from "./database";
import { logger } from "./logger";
import { stopSession, updateSessionStatus } from "./dryrunService";
import { DryrunSession, rowToSession } from "../models/dryrun";

// Configuration
const CLEANUP_INTERVAL_MS = 60 * 1000; // Check every 60 seconds
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

let cleanupTimer: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * Find sessions that need cleanup
 */
async function findStaleSessions(): Promise<DryrunSession[]> {
  // Find sessions that are:
  // 1. Running for more than 30 minutes
  // 2. Failed but not yet cleaned up
  // 3. Completed but not yet cleaned up (after grace period)
  const result = await pool.query(
    `SELECT *
     FROM gateway.dryrun_sessions
     WHERE (
       -- Running sessions older than timeout
       (status IN ('pending', 'generating', 'running')
        AND started_at < NOW() - INTERVAL '30 minutes')
       -- Failed sessions not cleaned (cleanup within 1 minute)
       OR (status = 'failed'
           AND cleanup_at IS NULL
           AND created_at < NOW() - INTERVAL '1 minute')
       -- Completed sessions past their scheduled cleanup time
       OR (status = 'completed'
           AND cleanup_at IS NOT NULL
           AND cleanup_at < NOW())
     )
     ORDER BY created_at ASC
     LIMIT 10`,
  );

  return result.rows.map((row) => rowToSession(row as Record<string, unknown>));
}

/**
 * Cleanup a single session
 */
async function cleanupSession(session: DryrunSession): Promise<boolean> {
  logger.info("Starting cleanup for stale session", {
    sessionId: session.id,
    status: session.status,
    startedAt: session.started_at?.toISOString(),
  });

  try {
    // Use the stopSession function to handle cleanup
    await stopSession(session.id);
    logger.info("Session cleanup completed", { sessionId: session.id });
    return true;
  } catch (error) {
    // If cleanup fails, mark session as failed with error message
    const errorMessage =
      error instanceof Error ? error.message : "Unknown cleanup error";
    logger.error("Session cleanup failed", {
      sessionId: session.id,
      error: errorMessage,
    });

    try {
      await updateSessionStatus(
        session.id,
        "failed",
        `Auto-cleanup failed: ${errorMessage}`,
      );
    } catch {
      // Ignore errors updating status
    }

    return false;
  }
}

/**
 * Run a single cleanup cycle
 */
async function runCleanupCycle(): Promise<{
  checked: number;
  cleaned: number;
  failed: number;
}> {
  if (isRunning) {
    logger.debug("Cleanup cycle already running, skipping");
    return { checked: 0, cleaned: 0, failed: 0 };
  }

  isRunning = true;
  const stats = { checked: 0, cleaned: 0, failed: 0 };

  try {
    const staleSessions = await findStaleSessions();
    stats.checked = staleSessions.length;

    if (staleSessions.length === 0) {
      logger.debug("No stale sessions found");
      return stats;
    }

    logger.info("Found stale sessions for cleanup", {
      count: staleSessions.length,
    });

    for (const session of staleSessions) {
      const success = await cleanupSession(session);
      if (success) {
        stats.cleaned++;
      } else {
        stats.failed++;
      }
    }

    logger.info("Cleanup cycle completed", stats);
    return stats;
  } catch (error) {
    logger.error("Cleanup cycle failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  } finally {
    isRunning = false;
  }
}

/**
 * Schedule cleanup for a session (sets the cleanup_at timestamp)
 */
export async function scheduleCleanup(
  sessionId: string,
  delayMs: number = SESSION_TIMEOUT_MS,
): Promise<void> {
  const cleanupAt = new Date(Date.now() + delayMs);

  await pool.query(
    `UPDATE gateway.dryrun_sessions
     SET cleanup_at = $1
     WHERE id = $2`,
    [cleanupAt.toISOString(), sessionId],
  );

  logger.info("Scheduled cleanup for session", {
    sessionId,
    cleanupAt: cleanupAt.toISOString(),
  });
}

/**
 * Cleanup orphaned sessions on startup
 * These are sessions that were running when the server was shut down
 */
async function cleanupOrphanedSessions(): Promise<void> {
  logger.info("Checking for orphaned dry-run sessions");

  try {
    // Find sessions that are in active states but were started more than 2 hours ago
    // These are likely orphaned from server restarts
    const result = await pool.query(
      `SELECT id, status, started_at
       FROM gateway.dryrun_sessions
       WHERE status IN ('pending', 'generating', 'running', 'cleaning_up')
       AND created_at < NOW() - INTERVAL '2 hours'`,
    );

    if (result.rows.length === 0) {
      logger.info("No orphaned sessions found");
      return;
    }

    logger.warn("Found orphaned sessions", { count: result.rows.length });

    for (const row of result.rows) {
      const sessionId = row.id as string;
      logger.info("Cleaning up orphaned session", {
        sessionId,
        status: row.status,
        startedAt: row.started_at,
      });

      try {
        await stopSession(sessionId);
      } catch (error) {
        logger.error("Failed to cleanup orphaned session", {
          sessionId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        // Mark as failed so it gets picked up by regular cleanup
        await updateSessionStatus(
          sessionId,
          "failed",
          "Orphaned session cleanup failed on restart",
        );
      }
    }
  } catch (error) {
    logger.error("Failed to check for orphaned sessions", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Start the cleanup scheduler
 */
export function startCleanupScheduler(): void {
  if (cleanupTimer) {
    logger.warn("Cleanup scheduler already running");
    return;
  }

  logger.info("Starting dry-run cleanup scheduler", {
    intervalMs: CLEANUP_INTERVAL_MS,
    timeoutMs: SESSION_TIMEOUT_MS,
  });

  // Cleanup orphaned sessions on startup
  cleanupOrphanedSessions().catch((err) =>
    logger.error("Orphaned session cleanup failed", { error: err.message }),
  );

  // Run initial cleanup after a short delay
  setTimeout(() => {
    runCleanupCycle().catch((err) =>
      logger.error("Initial cleanup cycle failed", { error: err.message }),
    );
  }, 10000);

  // Schedule regular cleanup cycles
  cleanupTimer = setInterval(() => {
    runCleanupCycle().catch((err) =>
      logger.error("Scheduled cleanup cycle failed", { error: err.message }),
    );
  }, CLEANUP_INTERVAL_MS);

  // Ensure the timer doesn't prevent Node from exiting
  cleanupTimer.unref();
}

/**
 * Stop the cleanup scheduler
 */
export function stopCleanupScheduler(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
    logger.info("Dry-run cleanup scheduler stopped");
  }
}

/**
 * Get cleanup scheduler status
 */
export function getCleanupStatus(): {
  running: boolean;
  intervalMs: number;
  timeoutMs: number;
} {
  return {
    running: cleanupTimer !== null,
    intervalMs: CLEANUP_INTERVAL_MS,
    timeoutMs: SESSION_TIMEOUT_MS,
  };
}

/**
 * Force a cleanup cycle (for testing or manual trigger)
 */
export async function forceCleanupCycle(): Promise<{
  checked: number;
  cleaned: number;
  failed: number;
}> {
  return runCleanupCycle();
}
