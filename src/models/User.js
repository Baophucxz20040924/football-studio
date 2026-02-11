const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true },
    userName: { type: String, default: "" },
    balance: { type: Number, default: 0 },
    lastSeen: { type: Date, default: null },
    lastDailyClaimDate: { type: Date, default: null },
    consecutiveDays: { type: Number, default: 0 }
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);
