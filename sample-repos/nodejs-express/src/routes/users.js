/**
 * User routes
 */

const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { authenticate, authorize } = require("../middleware/auth");
const { logger } = require("../utils/logger");

/**
 * Get current user profile
 * GET /api/users/me
 */
router.get("/me", authenticate, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Update current user profile
 * PUT /api/users/me
 */
router.put(
  "/me",
  authenticate,
  [
    body("name").optional().trim().notEmpty(),
    body("email").optional().isEmail().normalizeEmail(),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, email } = req.body;
      const updateData = {};

      if (name) updateData.name = name;
      if (email) {
        // Check if email is already used
        const existingUser = await User.findOne({
          email,
          _id: { $ne: req.user.userId },
        });
        if (existingUser) {
          return res.status(409).json({ error: "Email already in use" });
        }
        updateData.email = email;
      }

      const user = await User.findByIdAndUpdate(
        req.user.userId,
        { $set: updateData },
        { new: true },
      );

      logger.info(`User profile updated: ${user.email}`);

      res.json({
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Change password
 * POST /api/users/me/password
 */
router.post(
  "/me/password",
  authenticate,
  [
    body("currentPassword").notEmpty(),
    body("newPassword").isLength({ min: 8 }),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { currentPassword, newPassword } = req.body;

      const user = await User.findById(req.user.userId).select("+password");

      // Verify current password
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }

      // Hash new password
      const salt = await bcrypt.genSalt(12);
      user.password = await bcrypt.hash(newPassword, salt);
      await user.save();

      logger.info(`Password changed for user: ${user.email}`);

      res.json({ message: "Password changed successfully" });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * List all users (admin only)
 * GET /api/users
 */
router.get("/", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find().skip(skip).limit(limit).sort({ createdAt: -1 }),
      User.countDocuments(),
    ]);

    res.json({
      users: users.map((u) => ({
        id: u._id,
        email: u.email,
        name: u.name,
        role: u.role,
        createdAt: u.createdAt,
        lastLogin: u.lastLogin,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
