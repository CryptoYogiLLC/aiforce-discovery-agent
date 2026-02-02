import { Router, Request, Response } from "express";
import { body, param, query, validationResult } from "express-validator";
import { discoveryService } from "../services/discovery";
import { logger } from "../services/logger";

const router = Router();

// Validation error handler
const handleValidation = (req: Request, res: Response): boolean => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return false;
  }
  return true;
};

// GET /api/discoveries - List discoveries with pagination and filters
router.get(
  "/",
  [
    query("page").optional().isInt({ min: 1 }),
    query("pageSize").optional().isInt({ min: 1, max: 100 }),
    query("status").optional().isIn(["pending", "approved", "rejected"]),
    query("sourceService").optional().isString(),
    query("sortBy")
      .optional()
      .isIn([
        "created_at",
        "updated_at",
        "status",
        "event_type",
        "source_service",
      ]),
    query("sortOrder").optional().isIn(["asc", "desc"]),
  ],
  async (req: Request, res: Response) => {
    if (!handleValidation(req, res)) return;

    try {
      const result = await discoveryService.list({
        page: parseInt(req.query.page as string) || 1,
        pageSize: parseInt(req.query.pageSize as string) || 20,
        status: req.query.status as string,
        sourceService: req.query.sourceService as string,
        sortBy: req.query.sortBy as string,
        sortOrder: req.query.sortOrder as "asc" | "desc",
      });

      res.json(result);
    } catch (error) {
      logger.error("Failed to list discoveries", { error });
      res.status(500).json({ error: "Failed to list discoveries" });
    }
  },
);

// GET /api/discoveries/:id - Get single discovery
router.get(
  "/:id",
  [param("id").isUUID()],
  async (req: Request, res: Response) => {
    if (!handleValidation(req, res)) return;

    try {
      const discovery = await discoveryService.getById(req.params.id);
      if (!discovery) {
        return res.status(404).json({ error: "Discovery not found" });
      }
      res.json(discovery);
    } catch (error) {
      logger.error("Failed to get discovery", { error, id: req.params.id });
      res.status(500).json({ error: "Failed to get discovery" });
    }
  },
);

// POST /api/discoveries/:id/approve - Approve single discovery
router.post(
  "/:id/approve",
  [param("id").isUUID(), body("actor").optional().isString()],
  async (req: Request, res: Response) => {
    if (!handleValidation(req, res)) return;

    try {
      const actor = req.body.actor || "system";
      const discovery = await discoveryService.approve(req.params.id, actor);

      if (!discovery) {
        return res.status(404).json({ error: "Discovery not found" });
      }

      res.json(discovery);
    } catch (error) {
      if (error instanceof Error && error.message.includes("Cannot approve")) {
        return res.status(400).json({ error: error.message });
      }
      logger.error("Failed to approve discovery", { error, id: req.params.id });
      res.status(500).json({ error: "Failed to approve discovery" });
    }
  },
);

// POST /api/discoveries/:id/reject - Reject single discovery
router.post(
  "/:id/reject",
  [
    param("id").isUUID(),
    body("reason")
      .isString()
      .notEmpty()
      .withMessage("Rejection reason required"),
    body("actor").optional().isString(),
  ],
  async (req: Request, res: Response) => {
    if (!handleValidation(req, res)) return;

    try {
      const actor = req.body.actor || "system";
      const discovery = await discoveryService.reject(
        req.params.id,
        actor,
        req.body.reason,
      );

      if (!discovery) {
        return res.status(404).json({ error: "Discovery not found" });
      }

      res.json(discovery);
    } catch (error) {
      if (error instanceof Error && error.message.includes("Cannot reject")) {
        return res.status(400).json({ error: error.message });
      }
      logger.error("Failed to reject discovery", { error, id: req.params.id });
      res.status(500).json({ error: "Failed to reject discovery" });
    }
  },
);

// POST /api/discoveries/batch/approve - Bulk approve
router.post(
  "/batch/approve",
  [
    body("ids").isArray({ min: 1 }).withMessage("IDs array required"),
    body("ids.*").isUUID(),
    body("actor").optional().isString(),
  ],
  async (req: Request, res: Response) => {
    if (!handleValidation(req, res)) return;

    try {
      const actor = req.body.actor || "system";
      const approved = await discoveryService.batchApprove(req.body.ids, actor);

      res.json({
        approved,
        total: req.body.ids.length,
        message: `Approved ${approved} of ${req.body.ids.length} discoveries`,
      });
    } catch (error) {
      logger.error("Failed to batch approve discoveries", { error });
      res.status(500).json({ error: "Failed to batch approve discoveries" });
    }
  },
);

export const discoveryRoutes = router;
