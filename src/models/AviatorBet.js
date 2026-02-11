const mongoose = require("mongoose");

const AviatorBetSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    amount: { type: Number, required: true },
    autoCashout: { type: Number, default: 0 },
    slot: { type: Number, default: 0 },
    status: { type: String, enum: ["open", "won", "lost"], default: "open" },
    cashoutAt: { type: Number, default: 0 },
    winAmount: { type: Number, default: 0 },
    crashPoint: { type: Number, default: 0 }
  },
  { timestamps: true }
);

module.exports = mongoose.model("AviatorBet", AviatorBetSchema);
