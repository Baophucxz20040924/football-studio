const mongoose = require("mongoose");

const ShopItemSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    item: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ["available", "soldout", "hidden"],
      default: "available"
    },
    updatedBy: { type: String, default: "" },
    updatedByName: { type: String, default: "" }
  },
  { timestamps: true }
);

ShopItemSchema.index({ status: 1, item: 1 });

module.exports = mongoose.model("ShopItem", ShopItemSchema);
