/**
 * Product routes
 */

const express = require("express");
const router = express.Router();
const { body, query, validationResult } = require("express-validator");
const Product = require("../models/Product");
const { authenticate, authorize } = require("../middleware/auth");
const { logger } = require("../utils/logger");

/**
 * Get all products with pagination and filtering
 * GET /api/products
 */
router.get(
  "/",
  [
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 100 }),
    query("category").optional().isString(),
    query("minPrice").optional().isFloat({ min: 0 }),
    query("maxPrice").optional().isFloat({ min: 0 }),
    query("search").optional().isString(),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const skip = (page - 1) * limit;

      // Build filter
      const filter = { status: "active" };

      if (req.query.category) {
        filter.category = req.query.category;
      }

      if (req.query.minPrice || req.query.maxPrice) {
        filter.price = {};
        if (req.query.minPrice)
          filter.price.$gte = parseFloat(req.query.minPrice);
        if (req.query.maxPrice)
          filter.price.$lte = parseFloat(req.query.maxPrice);
      }

      if (req.query.search) {
        filter.$text = { $search: req.query.search };
      }

      const [products, total] = await Promise.all([
        Product.find(filter).skip(skip).limit(limit).sort({ createdAt: -1 }),
        Product.countDocuments(filter),
      ]);

      res.json({
        products,
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
  },
);

/**
 * Get single product
 * GET /api/products/:id
 */
router.get("/:id", async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json(product);
  } catch (error) {
    next(error);
  }
});

/**
 * Create new product (admin only)
 * POST /api/products
 */
router.post(
  "/",
  authenticate,
  authorize("admin"),
  [
    body("name").trim().notEmpty(),
    body("description").trim().notEmpty(),
    body("price").isFloat({ min: 0.01 }),
    body("category").trim().notEmpty(),
    body("sku").trim().notEmpty(),
    body("stock").isInt({ min: 0 }),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, description, price, category, sku, stock, images } =
        req.body;

      // Check for duplicate SKU
      const existingProduct = await Product.findOne({ sku });
      if (existingProduct) {
        return res.status(409).json({ error: "SKU already exists" });
      }

      const product = new Product({
        name,
        description,
        price,
        category,
        sku,
        stock,
        images: images || [],
        status: "active",
      });

      await product.save();

      logger.info(`Product created: ${sku}`);

      res.status(201).json(product);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Update product (admin only)
 * PUT /api/products/:id
 */
router.put(
  "/:id",
  authenticate,
  authorize("admin"),
  [
    body("name").optional().trim().notEmpty(),
    body("description").optional().trim().notEmpty(),
    body("price").optional().isFloat({ min: 0.01 }),
    body("stock").optional().isInt({ min: 0 }),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const product = await Product.findByIdAndUpdate(
        req.params.id,
        { $set: req.body },
        { new: true, runValidators: true },
      );

      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }

      logger.info(`Product updated: ${product.sku}`);

      res.json(product);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Delete product (admin only)
 * DELETE /api/products/:id
 */
router.delete(
  "/:id",
  authenticate,
  authorize("admin"),
  async (req, res, next) => {
    try {
      const product = await Product.findByIdAndUpdate(
        req.params.id,
        { status: "deleted" },
        { new: true },
      );

      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }

      logger.info(`Product deleted: ${product.sku}`);

      res.json({ message: "Product deleted successfully" });
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;
