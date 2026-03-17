const mongoose = require("mongoose");

const TradeSessionSchema = new mongoose.Schema(
  {
    symbol: { type: String, required: true, index: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    status: { type: String, enum: ["upcoming", "active", "settled", "cancelled"], default: "upcoming" },
    openPrice: { type: Number, default: 0 },
    closePrice: { type: Number, default: 0 },
    priceSource: { type: String, default: "binance" },
    settledAt: { type: Date, default: null },
    betCount: { type: Number, default: 0 },
    totalStake: { type: Number, default: 0 },
    result: { type: String, enum: ["up", "down", "flat", "pending"], default: "pending" }
  },
  { timestamps: true }
);

TradeSessionSchema.index({ symbol: 1, startTime: 1 }, { unique: true });
TradeSessionSchema.index({ status: 1, startTime: 1 });

module.exports = mongoose.model("TradeSession", TradeSessionSchema);