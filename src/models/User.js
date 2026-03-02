const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true },
    userName: { type: String, default: "" },
    balance: { type: Number, default: 0 },
    lastSeen: { type: Date, default: null },
    lastDailyClaimDate: { type: Date, default: null },
    lastWorkClaimAt: { type: Date, default: null },
    consecutiveDays: { type: Number, default: 0 }
  },
  { timestamps: true }
);

UserSchema.index({ updatedAt: -1 });

module.exports = mongoose.model("User", UserSchema);
