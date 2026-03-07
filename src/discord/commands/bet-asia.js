const { createQuickBetCommand } = require("./quick-bet-command");

module.exports = createQuickBetCommand({
  commandName: "bet-asia",
  commandDescription: "Dat cuoc Asia (AFC Asian Cup + KSA)",
  sport: "football",
  leagues: ["afc_asian_cup", "ksa1"],
  noMatchMessage: "No Asia matches are open for betting right now.",
  panelTitle: "Bet Asia 🌏",
  sessionExpiredMessage: "Session expired. Please run /bet-asia again."
});
