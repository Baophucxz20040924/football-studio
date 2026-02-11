const mongoose = require("mongoose");

const AviatorRoundSchema = new mongoose.Schema(
  {
    crashPoint: { type: Number, required: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("AviatorRound", AviatorRoundSchema);
