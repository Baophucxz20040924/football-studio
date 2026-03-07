const { createQuickBetCommand } = require("./quick-bet-command");

module.exports = createQuickBetCommand({
  commandName: "bet-afc",
  commandDescription: "Dat cuoc AFC Champions",
  sport: "football",
  league: "afc",
  noMatchMessage: "No AFC Champions matches are open for betting right now.",
  panelTitle: "Bet AFC Champions 🏆",
  sessionExpiredMessage: "Session expired. Please run /bet-afc again."
});
