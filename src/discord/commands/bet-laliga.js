const { createQuickBetCommand } = require("./quick-bet-command");

module.exports = createQuickBetCommand({
  commandName: "bet-laliga",
  commandDescription: "Dat cuoc LaLiga",
  sport: "football",
  league: "laliga",
  noMatchMessage: "No LaLiga matches are open for betting right now.",
  panelTitle: "Bet LaLiga 🇪🇸",
  sessionExpiredMessage: "Session expired. Please run /bet-laliga again."
});
