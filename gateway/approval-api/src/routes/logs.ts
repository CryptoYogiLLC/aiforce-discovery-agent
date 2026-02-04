/**
 * Log streaming routes
 * Reference: GitHub Issue #77
 */

import { Router } from "express";
import { streamLogs, getRecentLogs } from "../controllers/logController";
import { authenticate } from "../middleware/auth";

const router = Router();

// All log endpoints require authentication
router.use(authenticate);

/**
 * @route GET /api/logs/stream
 * @desc SSE endpoint for real-time log streaming
 * @access Private (requires authentication)
 */
router.get("/stream", streamLogs);

/**
 * @route GET /api/logs/recent
 * @desc Get recent logs from buffer (non-SSE)
 * @access Private (requires authentication)
 * @query count - Number of logs to return (default: 50, max: 100)
 */
router.get("/recent", getRecentLogs);

export default router;
