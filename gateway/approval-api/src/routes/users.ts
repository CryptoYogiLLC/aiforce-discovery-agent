/**
 * User management routes (Admin only)
 * Reference: GitHub Issue #64
 */

import { Router, Request, Response } from "express";
import { body, param, query, validationResult } from "express-validator";
import {
  createUser,
  getUserById,
  listUsers,
  updateUser,
  deactivateUser,
  reactivateUser,
  getUserPermissions,
} from "../services/userService";
import {
  authenticate,
  validateCsrf,
  requirePermission,
  logAuthEvent,
} from "../middleware/auth";
import { UserRole } from "../models/user";
import { logger } from "../services/logger";

const router = Router();

// All user management routes require authentication
// Authorization is handled per-route via requirePermission for flexibility
router.use(authenticate);

/**
 * GET /api/users - List all users
 */
router.get(
  "/",
  requirePermission("users.read"),
  [
    query("page").optional().isInt({ min: 1 }).toInt(),
    query("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
    query("role").optional().isIn(["admin", "operator", "viewer"]),
    query("is_active").optional().isBoolean().toBoolean(),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    try {
      const result = await listUsers(
        (req.query.page as unknown as number) || 1,
        (req.query.limit as unknown as number) || 20,
        {
          role: req.query.role as UserRole,
          is_active: req.query.is_active as unknown as boolean,
        },
      );

      res.json(result);
    } catch (err) {
      logger.error("List users error", { error: (err as Error).message });
      res.status(500).json({ error: "Failed to list users" });
    }
  },
);

/**
 * GET /api/users/:id - Get user by ID
 */
router.get(
  "/:id",
  requirePermission("users.read"),
  [param("id").isUUID()],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    try {
      const user = await getUserById(req.params.id);

      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const permissions = await getUserPermissions(req.params.id);
      res.json({ ...user, permissions });
    } catch (err) {
      logger.error("Get user error", { error: (err as Error).message });
      res.status(500).json({ error: "Failed to get user" });
    }
  },
);

/**
 * POST /api/users - Create new user
 */
router.post(
  "/",
  validateCsrf,
  requirePermission("users.create"),
  [
    body("username")
      .isString()
      .trim()
      .isLength({ min: 3, max: 100 })
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage(
        "Username must be 3-100 alphanumeric characters, underscores, or hyphens",
      ),
    body("email")
      .isEmail()
      .normalizeEmail()
      .withMessage("Valid email is required"),
    body("password")
      .isString()
      .isLength({ min: 12 })
      .withMessage("Password must be at least 12 characters"),
    body("role")
      .optional()
      .isIn(["admin", "operator", "viewer"])
      .withMessage("Role must be admin, operator, or viewer"),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { username, email, password, role } = req.body;

    try {
      // Rely on database unique constraints to prevent race conditions
      // instead of pre-checking which has TOCTOU vulnerability
      const user = await createUser({ username, email, password, role });

      await logAuthEvent(req, "user_created", true, {
        created_user_id: user.id,
        created_username: user.username,
        created_role: user.role,
      });

      res.status(201).json(user);
    } catch (err) {
      // Check for PostgreSQL unique constraint violation
      const pgError = err as { code?: string; constraint?: string };
      if (pgError.code === "23505") {
        // Unique constraint violation
        if (pgError.constraint?.includes("username")) {
          res.status(409).json({ error: "Username already exists" });
        } else if (pgError.constraint?.includes("email")) {
          res.status(409).json({ error: "Email already exists" });
        } else {
          res.status(409).json({ error: "Username or email already exists" });
        }
        return;
      }
      logger.error("Create user error", { error: (err as Error).message });
      res.status(500).json({ error: "Failed to create user" });
    }
  },
);

/**
 * PATCH /api/users/:id - Update user
 */
router.patch(
  "/:id",
  validateCsrf,
  requirePermission("users.update"),
  [
    param("id").isUUID(),
    body("email").optional().isEmail().normalizeEmail(),
    body("role").optional().isIn(["admin", "operator", "viewer"]),
    body("is_active").optional().isBoolean(),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { email, role, is_active } = req.body;

    try {
      // Prevent self-demotion
      if (req.params.id === req.user?.id && role && role !== "admin") {
        res.status(400).json({ error: "Cannot change own role from admin" });
        return;
      }

      // Email uniqueness is enforced by database UNIQUE constraint
      // This prevents race conditions that a manual check would have
      const user = await updateUser(req.params.id, { email, role, is_active });

      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      await logAuthEvent(req, "user_updated", true, {
        updated_user_id: user.id,
        updates: { email, role, is_active },
      });

      res.json(user);
    } catch (err) {
      const error = err as Error & { code?: string };
      // Handle unique constraint violation from database
      if (error.code === "23505" && error.message.includes("email")) {
        res.status(409).json({ error: "Email already exists" });
        return;
      }
      logger.error("Update user error", { error: error.message });
      res.status(500).json({ error: "Failed to update user" });
    }
  },
);

/**
 * POST /api/users/:id/deactivate - Deactivate user
 */
router.post(
  "/:id/deactivate",
  validateCsrf,
  requirePermission("users.delete"),
  [param("id").isUUID()],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    // Prevent self-deactivation
    if (req.params.id === req.user?.id) {
      res.status(400).json({ error: "Cannot deactivate yourself" });
      return;
    }

    try {
      const success = await deactivateUser(req.params.id);

      if (!success) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      await logAuthEvent(req, "user_deactivated", true, {
        deactivated_user_id: req.params.id,
      });

      res.json({ message: "User deactivated successfully" });
    } catch (err) {
      logger.error("Deactivate user error", { error: (err as Error).message });
      res.status(500).json({ error: "Failed to deactivate user" });
    }
  },
);

/**
 * POST /api/users/:id/reactivate - Reactivate user
 */
router.post(
  "/:id/reactivate",
  validateCsrf,
  requirePermission("users.update"),
  [param("id").isUUID()],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    try {
      const success = await reactivateUser(req.params.id);

      if (!success) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      await logAuthEvent(req, "user_reactivated", true, {
        reactivated_user_id: req.params.id,
      });

      res.json({ message: "User reactivated successfully" });
    } catch (err) {
      logger.error("Reactivate user error", { error: (err as Error).message });
      res.status(500).json({ error: "Failed to reactivate user" });
    }
  },
);

export default router;
