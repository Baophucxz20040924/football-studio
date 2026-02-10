const mongoose = require("mongoose");

const BetSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    matchId: { type: mongoose.Schema.Types.ObjectId, ref: "Match", required: true },
    pickKey: { type: String, required: true },
    amount: { type: Number, required: true },
    multiplier: { type: Number, required: true },
    status: { type: String, enum: ["open", "won", "lost"], default: "open" },
    payout: { type: Number, default: 0 }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Bet", BetSchema);
