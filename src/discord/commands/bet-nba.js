const { createQuickBetCommand } = require("./quick-bet-command");

module.exports = createQuickBetCommand({
  commandName: "bet-nba",
  commandDescription: "Đặt cược NBA",
  sport: "basketball",
  league: "nba",
  noMatchMessage: "No NBA matches are open for betting right now.",
  panelTitle: "Bet NBA 🏀",
  sessionExpiredMessage: "Session expired. Please run /bet-nba again."
});
