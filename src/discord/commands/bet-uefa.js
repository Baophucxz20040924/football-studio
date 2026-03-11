const { createQuickBetCommand } = require("./quick-bet-command");

module.exports = createQuickBetCommand({
  commandName: "bet-uefa",
  commandDescription: "Dat cuoc UEFA Champions League",
  sport: "football",
  league: "uefa",
  noMatchMessage: "No UEFA Champions League matches are open for betting right now.",
  panelTitle: "Bet UEFA Champions League 🏆",
  sessionExpiredMessage: "Session expired. Please run /bet-uefa again."
});