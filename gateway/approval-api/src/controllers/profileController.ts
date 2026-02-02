/**
 * Configuration Profile controller
 * Reference: ADR-005 Configuration Propagation Model, GitHub Issue #56
 */

import { Request, Response } from "express";
import { body, param, query, validationResult } from "express-validator";
import YAML from "yaml";
import {
  listProfiles,
  getProfileById,
  createProfile,
  cloneProfile,
  updateProfile,
  deleteProfile,
  exportProfileAsYaml,
  parseYamlImport,
} from "../services/profileService";
import { logger } from "../services/logger";

/**
 * GET /api/profiles
 * List all configuration profiles
 */
export const listProfilesValidation = [
  query("type")
    .optional()
    .isIn(["preset", "custom"])
    .withMessage("Type must be 'preset' or 'custom'"),
];

export async function listProfilesHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    const profiles = await listProfiles({
      profile_type: req.query.type as "preset" | "custom" | undefined,
    });

    res.json({ profiles });
  } catch (err) {
    logger.error("Failed to list profiles", { error: (err as Error).message });
    res.status(500).json({ error: "Failed to list profiles" });
  }
}

/**
 * GET /api/profiles/:id
 * Get a specific profile
 */
export const getProfileValidation = [
  param("id").isUUID().withMessage("Valid profile ID is required"),
];

export async function getProfileHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    const profile = await getProfileById(req.params.id);

    if (!profile) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }

    res.json({ profile });
  } catch (err) {
    logger.error("Failed to get profile", { error: (err as Error).message });
    res.status(500).json({ error: "Failed to get profile" });
  }
}

/**
 * POST /api/profiles
 * Create a new custom profile
 */
export const createProfileValidation = [
  body("name")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ max: 100 })
    .withMessage("Name must be at most 100 characters"),
  body("description")
    .optional()
    .isString()
    .isLength({ max: 500 })
    .withMessage("Description must be at most 500 characters"),
  body("target_subnets").optional().isArray().withMessage("Must be an array"),
  body("port_ranges").optional().isObject().withMessage("Must be an object"),
  body("scan_rate_limit")
    .optional()
    .isInt({ min: 1, max: 10000 })
    .withMessage("Scan rate must be between 1 and 10000"),
  body("max_services")
    .optional()
    .isInt({ min: 1, max: 100000 })
    .withMessage("Max services must be between 1 and 100000"),
  body("max_hosts")
    .optional()
    .isInt({ min: 1, max: 50000 })
    .withMessage("Max hosts must be between 1 and 50000"),
  body("timeout_seconds")
    .optional()
    .isInt({ min: 1, max: 300 })
    .withMessage("Timeout must be between 1 and 300"),
  body("disk_space_limit_mb")
    .optional()
    .isInt({ min: 100, max: 102400 })
    .withMessage("Disk space must be between 100 and 102400 MB"),
  body("memory_limit_mb")
    .optional()
    .isInt({ min: 128, max: 8192 })
    .withMessage("Memory must be between 128 and 8192 MB"),
  body("enabled_collectors")
    .optional()
    .isArray()
    .withMessage("Must be an array"),
  body("advanced_settings")
    .optional()
    .isObject()
    .withMessage("Must be an object"),
];

export async function createProfileHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const result = await createProfile(req.body, req.user.id);

    if (result.errors) {
      res.status(400).json({ errors: result.errors });
      return;
    }

    res.status(201).json({
      profile: result.profile,
      message: "Profile created. Changes will take effect on the next scan.",
    });
  } catch (err) {
    logger.error("Failed to create profile", { error: (err as Error).message });
    res.status(500).json({ error: "Failed to create profile" });
  }
}

/**
 * POST /api/profiles/:id/clone
 * Clone a profile
 */
export const cloneProfileValidation = [
  param("id").isUUID().withMessage("Valid profile ID is required"),
  body("name")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("New name is required")
    .isLength({ max: 100 })
    .withMessage("Name must be at most 100 characters"),
];

export async function cloneProfileHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const result = await cloneProfile(
      req.params.id,
      req.body.name,
      req.user.id,
    );

    if (result.errors) {
      res.status(400).json({ errors: result.errors });
      return;
    }

    res.status(201).json({
      profile: result.profile,
      message: "Profile cloned successfully.",
    });
  } catch (err) {
    logger.error("Failed to clone profile", { error: (err as Error).message });
    res.status(500).json({ error: "Failed to clone profile" });
  }
}

/**
 * PATCH /api/profiles/:id
 * Update a custom profile
 */
export const updateProfileValidation = [
  param("id").isUUID().withMessage("Valid profile ID is required"),
  body("name")
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Name cannot be empty")
    .isLength({ max: 100 })
    .withMessage("Name must be at most 100 characters"),
  body("description")
    .optional()
    .isString()
    .isLength({ max: 500 })
    .withMessage("Description must be at most 500 characters"),
  body("target_subnets").optional().isArray().withMessage("Must be an array"),
  body("port_ranges").optional().isObject().withMessage("Must be an object"),
  body("scan_rate_limit")
    .optional()
    .isInt({ min: 1, max: 10000 })
    .withMessage("Scan rate must be between 1 and 10000"),
  body("max_services")
    .optional()
    .isInt({ min: 1, max: 100000 })
    .withMessage("Max services must be between 1 and 100000"),
  body("max_hosts")
    .optional()
    .isInt({ min: 1, max: 50000 })
    .withMessage("Max hosts must be between 1 and 50000"),
  body("timeout_seconds")
    .optional()
    .isInt({ min: 1, max: 300 })
    .withMessage("Timeout must be between 1 and 300"),
  body("disk_space_limit_mb")
    .optional()
    .isInt({ min: 100, max: 102400 })
    .withMessage("Disk space must be between 100 and 102400 MB"),
  body("memory_limit_mb")
    .optional()
    .isInt({ min: 128, max: 8192 })
    .withMessage("Memory must be between 128 and 8192 MB"),
  body("enabled_collectors")
    .optional()
    .isArray()
    .withMessage("Must be an array"),
  body("advanced_settings")
    .optional()
    .isObject()
    .withMessage("Must be an object"),
];

export async function updateProfileHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    const result = await updateProfile(req.params.id, req.body);

    if (result.errors) {
      const isNotFound = result.errors.some(
        (e) => e.message === "Profile not found",
      );
      res.status(isNotFound ? 404 : 400).json({ errors: result.errors });
      return;
    }

    res.json({
      profile: result.profile,
      message: "Profile saved. Changes will take effect on the next scan.",
    });
  } catch (err) {
    logger.error("Failed to update profile", { error: (err as Error).message });
    res.status(500).json({ error: "Failed to update profile" });
  }
}

/**
 * DELETE /api/profiles/:id
 * Delete a custom profile
 */
export const deleteProfileValidation = [
  param("id").isUUID().withMessage("Valid profile ID is required"),
];

export async function deleteProfileHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    const result = await deleteProfile(req.params.id);

    if (!result.success) {
      const status = result.error === "Profile not found" ? 404 : 400;
      res.status(status).json({ error: result.error });
      return;
    }

    res.json({ message: "Profile deleted successfully" });
  } catch (err) {
    logger.error("Failed to delete profile", { error: (err as Error).message });
    res.status(500).json({ error: "Failed to delete profile" });
  }
}

/**
 * GET /api/profiles/:id/export
 * Export profile as YAML
 */
export const exportProfileValidation = [
  param("id").isUUID().withMessage("Valid profile ID is required"),
];

export async function exportProfileHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    const profile = await getProfileById(req.params.id);

    if (!profile) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }

    const yamlObj = exportProfileAsYaml(profile);
    const yamlStr = YAML.stringify(yamlObj);

    res.setHeader("Content-Type", "application/x-yaml");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${profile.name.replace(/[^a-z0-9]/gi, "_")}.yaml"`,
    );
    res.send(yamlStr);
  } catch (err) {
    logger.error("Failed to export profile", { error: (err as Error).message });
    res.status(500).json({ error: "Failed to export profile" });
  }
}

/**
 * POST /api/profiles/import
 * Import profile from YAML
 */
export const importProfileValidation = [
  body("yaml").isString().notEmpty().withMessage("YAML content is required"),
];

export async function importProfileHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const validationErrors = validationResult(req);
  if (!validationErrors.isEmpty()) {
    res.status(400).json({ errors: validationErrors.array() });
    return;
  }

  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    // Safe YAML parsing
    let parsed: unknown;
    try {
      parsed = YAML.parse(req.body.yaml);
    } catch {
      res.status(400).json({
        errors: [{ field: "yaml", message: "Invalid YAML syntax" }],
      });
      return;
    }

    const parseResult = parseYamlImport(parsed);
    if (parseResult.errors) {
      res.status(400).json({ errors: parseResult.errors });
      return;
    }

    const result = await createProfile(parseResult.input!, req.user.id);

    if (result.errors) {
      res.status(400).json({ errors: result.errors });
      return;
    }

    res.status(201).json({
      profile: result.profile,
      message: "Profile imported successfully.",
    });
  } catch (err) {
    logger.error("Failed to import profile", { error: (err as Error).message });
    res.status(500).json({ error: "Failed to import profile" });
  }
}
