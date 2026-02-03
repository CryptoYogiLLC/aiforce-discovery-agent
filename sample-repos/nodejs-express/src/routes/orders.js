/**
 * Order routes
 */

const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const Order = require("../models/Order");
const Product = require("../models/Product");
const { authenticate, authorize } = require("../middleware/auth");
const { logger } = require("../utils/logger");
const _ = require("lodash");

/**
 * Get user's orders
 * GET /api/orders
 */
router.get("/", authenticate, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = {};

    // Non-admin users can only see their own orders
    if (req.user.role !== "admin") {
      filter.userId = req.user.userId;
    }

    if (req.query.status) {
      filter.status = req.query.status;
    }

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .populate("items.product", "name sku price"),
      Order.countDocuments(filter),
    ]);

    res.json({
      orders,
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

/**
 * Get single order
 * GET /api/orders/:id
 */
router.get("/:id", authenticate, async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id).populate(
      "items.product",
      "name sku price images",
    );

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Check authorization
    if (
      req.user.role !== "admin" &&
      order.userId.toString() !== req.user.userId
    ) {
      return res.status(403).json({ error: "Not authorized" });
    }

    res.json(order);
  } catch (error) {
    next(error);
  }
});

/**
 * Create new order
 * POST /api/orders
 */
router.post(
  "/",
  authenticate,
  [
    body("items").isArray({ min: 1 }),
    body("items.*.productId").isMongoId(),
    body("items.*.quantity").isInt({ min: 1 }),
    body("shippingAddress").isObject(),
    body("shippingAddress.street").notEmpty(),
    body("shippingAddress.city").notEmpty(),
    body("shippingAddress.state").notEmpty(),
    body("shippingAddress.zip").notEmpty(),
    body("shippingAddress.country").notEmpty(),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { items, shippingAddress, notes } = req.body;

      // Validate products and calculate totals
      const orderItems = [];
      let subtotal = 0;

      for (const item of items) {
        const product = await Product.findById(item.productId);

        if (!product) {
          return res
            .status(400)
            .json({ error: `Product ${item.productId} not found` });
        }

        if (product.status !== "active") {
          return res
            .status(400)
            .json({ error: `Product ${product.sku} is not available` });
        }

        if (product.stock < item.quantity) {
          return res.status(400).json({
            error: `Insufficient stock for ${product.sku}. Available: ${product.stock}`,
          });
        }

        const itemTotal = product.price * item.quantity;
        subtotal += itemTotal;

        orderItems.push({
          product: product._id,
          quantity: item.quantity,
          price: product.price,
          total: itemTotal,
        });

        // Reduce stock
        product.stock -= item.quantity;
        await product.save();
      }

      // Calculate shipping (simplified)
      const shipping = subtotal > 100 ? 0 : 9.99;

      // Calculate tax (simplified - 8%)
      const tax = _.round(subtotal * 0.08, 2);

      // Create order
      const order = new Order({
        userId: req.user.userId,
        orderNumber: generateOrderNumber(),
        items: orderItems,
        shippingAddress,
        notes,
        subtotal,
        shipping,
        tax,
        total: _.round(subtotal + shipping + tax, 2),
        status: "pending",
      });

      await order.save();

      logger.info(
        `Order created: ${order.orderNumber} by user ${req.user.userId}`,
      );

      res.status(201).json(order);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Cancel order
 * POST /api/orders/:id/cancel
 */
router.post("/:id/cancel", authenticate, async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Check authorization
    if (
      req.user.role !== "admin" &&
      order.userId.toString() !== req.user.userId
    ) {
      return res.status(403).json({ error: "Not authorized" });
    }

    // Only pending/confirmed orders can be cancelled
    if (!["pending", "confirmed"].includes(order.status)) {
      return res.status(400).json({
        error: "Only pending or confirmed orders can be cancelled",
      });
    }

    // Restore stock
    for (const item of order.items) {
      await Product.findByIdAndUpdate(item.product, {
        $inc: { stock: item.quantity },
      });
    }

    order.status = "cancelled";
    order.cancelledAt = new Date();
    await order.save();

    logger.info(`Order cancelled: ${order.orderNumber}`);

    res.json(order);
  } catch (error) {
    next(error);
  }
});

/**
 * Update order status (admin only)
 * PATCH /api/orders/:id/status
 */
router.patch(
  "/:id/status",
  authenticate,
  authorize("admin"),
  [
    body("status").isIn([
      "pending",
      "confirmed",
      "processing",
      "shipped",
      "delivered",
    ]),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const order = await Order.findByIdAndUpdate(
        req.params.id,
        {
          status: req.body.status,
          ...(req.body.status === "shipped" && { shippedAt: new Date() }),
          ...(req.body.status === "delivered" && { deliveredAt: new Date() }),
        },
        { new: true },
      );

      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      logger.info(
        `Order status updated: ${order.orderNumber} -> ${req.body.status}`,
      );

      res.json(order);
    } catch (error) {
      next(error);
    }
  },
);

function generateOrderNumber() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD-${timestamp}-${random}`;
}

module.exports = router;
