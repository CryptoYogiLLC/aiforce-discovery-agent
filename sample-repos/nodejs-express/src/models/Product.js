/**
 * Product model
 */

const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    sku: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    category: {
      type: String,
      required: true,
      trim: true,
    },
    stock: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    images: [
      {
        url: String,
        alt: String,
      },
    ],
    attributes: {
      type: Map,
      of: String,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "deleted"],
      default: "active",
    },
  },
  {
    timestamps: true,
  },
);

// Indexes
productSchema.index({ sku: 1 });
productSchema.index({ category: 1 });
productSchema.index({ status: 1, category: 1 });
productSchema.index({ name: "text", description: "text" });

module.exports = mongoose.model("Product", productSchema);
