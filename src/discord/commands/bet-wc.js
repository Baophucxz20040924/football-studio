const { createQuickBetCommand } = require("./quick-bet-command");

module.exports = createQuickBetCommand({
  commandName: "bet-wc",
  commandDescription: "Dat cuoc FIFA World Cup 2026",
  sport: "football",
  league: "worldcup_2026",
  noMatchMessage: "No FIFA World Cup 2026 matches are open for betting right now.",
  panelTitle: "Bet FIFA World Cup 2026 🌍",
  sessionExpiredMessage: "Session expired. Please run /bet-wc again."
});
