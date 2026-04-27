const mongoose = require("mongoose");

const TradeV2PositionSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    userName: { type: String, default: "" },
    symbol: { type: String, required: true, index: true },
    side: { type: String, enum: ["long", "short"], required: true },
    margin: { type: Number, required: true },
    leverage: { type: Number, required: true },
    quantity: { type: Number, required: true },
    entryPrice: { type: Number, default: 0 },
    exitPrice: { type: Number, default: 0 },
    status: { type: String, enum: ["open", "closed", "cancelled", "failed"], default: "open", index: true },
    matchStatus: { type: String, enum: ["filled", "failed"], default: "filled" },
    realizedPnl: { type: Number, default: 0 },
    openedAt: { type: Date, default: Date.now },
    closedAt: { type: Date, default: null },
    failureReason: { type: String, default: "" }
  },
  { timestamps: true }
);

TradeV2PositionSchema.index({ userId: 1, status: 1, openedAt: -1 });
TradeV2PositionSchema.index({ userId: 1, closedAt: -1 });
TradeV2PositionSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("TradeV2Position", TradeV2PositionSchema);
