const { createQuickBetCommand } = require("./quick-bet-command");

module.exports = createQuickBetCommand({
  commandName: "bet-epl",
  commandDescription: "Đặt cược EPL",
  sport: "football",
  noMatchMessage: "No football matches are open for betting right now.",
  panelTitle: "Bet EPL 🏆",
  sessionExpiredMessage: "Session expired. Please run /bet-epl again.",
  topBanner: "🔴⚪ ARS  🟣🔵 AVL  🔴⚫ BOU  🔵⚪ BHA  🔴⚪ BRE  🟣🔵 BUR  🔵⚪ CHE  🔵🔴 CRY  🔵⚪ EVE  ⚪⚫ FUL\n🔴⚪ LEE  🔴 LIV  🔴⚪ MUN  🔵 MCI  ⚫⚪ NEW  🔴 NFO  🔵⚪ SUN  ⚪⚫ TOT  ⚒️ WHU  🟠⚫ WOL"
});
