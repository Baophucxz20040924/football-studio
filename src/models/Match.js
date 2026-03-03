const mongoose = require("mongoose");

const OddsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    multiplier: { type: Number, required: true }
  },
  { _id: false }
);

const GoalSchema = new mongoose.Schema(
  {
    scorer: { type: String, required: true },
    team: { type: String, required: true },
    minute: { type: Number, default: null }
  },
  { _id: false }
);

const MatchSchema = new mongoose.Schema(
  {
    espnEventId: { type: String, index: true, unique: true, sparse: true },
    sport: { type: String, enum: ["football", "basketball"], default: "football", index: true },
    matchCode: { type: Number, unique: true, index: true },
    homeTeam: { type: String, required: true },
    awayTeam: { type: String, required: true },
    stadium: { type: String, default: "" },
    kickoff: { type: Date, required: true },
    odds: { type: [OddsSchema], default: [] },
    status: { type: String, enum: ["open", "closed"], default: "open" },
    scoreHome: { type: Number, default: 0 },
    scoreAway: { type: Number, default: 0 },
    cornerHome: { type: Number, default: 0 },
    cornerAway: { type: Number, default: 0 },
    winnerKey: { type: String, default: "" },
    winnerKeys: { type: [String], default: [] },
    isLive: { type: Boolean, default: false },
    prematchOddsSyncedAt: { type: Date, default: null },
    goals: { type: [GoalSchema], default: [] },
    betLocked: { type: Boolean, default: false }
  },
  { timestamps: true }
);

MatchSchema.index({ status: 1, kickoff: 1 });
MatchSchema.index({ sport: 1, status: 1, kickoff: 1 });
MatchSchema.index({ status: 1, betLocked: 1, kickoff: 1 });
MatchSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Match", MatchSchema);
