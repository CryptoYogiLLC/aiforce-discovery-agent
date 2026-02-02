import { Router, Request, Response } from "express";
import { query, param, validationResult } from "express-validator";
import { db } from "../services/database";
import { logger } from "../services/logger";

const router = Router();

interface AuditLogEntry {
  id: string;
  discovery_id: string;
  action: string;
  actor: string | null;
  details: Record<string, unknown> | null;
  created_at: Date;
}

interface PaginatedAuditResult {
  data: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Validation error handler
const handleValidation = (req: Request, res: Response): boolean => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return false;
  }
  return true;
};

// GET /api/audit - List audit log entries
router.get(
  "/",
  [
    query("page").optional().isInt({ min: 1 }),
    query("pageSize").optional().isInt({ min: 1, max: 100 }),
    query("discoveryId").optional().isUUID(),
    query("action").optional().isString(),
  ],
  async (req: Request, res: Response) => {
    if (!handleValidation(req, res)) return;

    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      const offset = (page - 1) * pageSize;

      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;

      if (req.query.discoveryId) {
        conditions.push(`discovery_id = $${paramIndex++}`);
        params.push(req.query.discoveryId);
      }

      if (req.query.action) {
        conditions.push(`action = $${paramIndex++}`);
        params.push(req.query.action);
      }

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      // Get total count
      const countResult = await db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM gateway.audit_log ${whereClause}`,
        params,
      );
      const total = parseInt(countResult[0]?.count || "0", 10);

      // Get paginated data
      const data = await db.query<AuditLogEntry>(
        `SELECT * FROM gateway.audit_log ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
        [...params, pageSize, offset],
      );

      const result: PaginatedAuditResult = {
        data,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };

      res.json(result);
    } catch (error) {
      logger.error("Failed to list audit log", { error });
      res.status(500).json({ error: "Failed to list audit log" });
    }
  },
);

// GET /api/audit/discovery/:id - Get audit log for specific discovery
router.get(
  "/discovery/:id",
  [param("id").isUUID()],
  async (req: Request, res: Response) => {
    if (!handleValidation(req, res)) return;

    try {
      const entries = await db.query<AuditLogEntry>(
        `SELECT * FROM gateway.audit_log
         WHERE discovery_id = $1
         ORDER BY created_at DESC`,
        [req.params.id],
      );

      res.json(entries);
    } catch (error) {
      logger.error("Failed to get audit log for discovery", {
        error,
        id: req.params.id,
      });
      res.status(500).json({ error: "Failed to get audit log" });
    }
  },
);

export const auditRoutes = router;
