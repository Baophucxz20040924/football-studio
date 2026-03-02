const mongoose = require("mongoose");

const AviatorRoundSchema = new mongoose.Schema(
  {
    crashPoint: { type: Number, required: true }
  },
  { timestamps: true }
);

AviatorRoundSchema.index({ createdAt: -1 });

module.exports = mongoose.model("AviatorRound", AviatorRoundSchema);
