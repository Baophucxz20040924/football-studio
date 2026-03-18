const mongoose = require("mongoose");

const TradeBetSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    userName: { type: String, default: "" },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "TradeSession", required: true },
    symbol: { type: String, required: true, index: true },
    direction: { type: String, enum: ["up", "down"], required: true },
    amount: { type: Number, required: true },
    channelId: { type: String, default: "" },
    messageId: { type: String, default: "" },
    status: { type: String, enum: ["open", "won", "lost", "push"], default: "open" },
    payout: { type: Number, default: 0 },
    settledAt: { type: Date, default: null }
  },
  { timestamps: true }
);

TradeBetSchema.index({ sessionId: 1, status: 1 });
TradeBetSchema.index({ userId: 1, createdAt: -1 });
TradeBetSchema.index({ userId: 1, sessionId: 1 }, { unique: true });

module.exports = mongoose.model("TradeBet", TradeBetSchema);