const { createQuickBetCommand } = require("./quick-bet-command");
const { primeEmojiCaches, findEmojiByName } = require("./utils");

const EPL_TEAM_TOKENS = [
  { code: "ARS", emojiName: "Arsenal_FC", fallback: "🔴⚪" },
  { code: "AVL", emojiName: "Aston_Villa_FC", fallback: "🟣🔵" },
  { code: "BOU", emojiName: "Bournemouth_FC", fallback: "🔴⚫" },
  { code: "BHA", emojiName: "Brighton_FC", fallback: "🔵⚪" },
  { code: "BRE", emojiName: "Brentford_FC", fallback: "🔴⚪" },
  { code: "BUR", emojiName: "Burnley_FC", fallback: "🟣🔵" },
  { code: "CHE", emojiName: "Chelsea_FC", fallback: "🔵⚪" },
  { code: "CRY", emojiName: "Crystal_Palace_FC", fallback: "🔵🔴" },
  { code: "EVE", emojiName: "Everton_FC", fallback: "🔵⚪" },
  { code: "FUL", emojiName: "Fulham_FC", fallback: "⚪⚫" },
  { code: "LEE", emojiName: "Leeds_United_FC", fallback: "⚪🔵" },
  { code: "LIV", emojiName: "Liverpool_FC", fallback: "🔴" },
  { code: "MUN", emojiName: "MU_FC", fallback: "🔴⚪" },
  { code: "MCI", emojiName: "MC_FC", fallback: "🔵" },
  { code: "NEW", emojiName: "Newcastle_United_FC", fallback: "⚫⚪" },
  { code: "NFO", emojiName: "Nottingham_Forest_FC", fallback: "🔴" },
  { code: "SUN", emojiName: "Sunderland_FC", fallback: "🔵⚪" },
  { code: "TOT", emojiName: "Tottenham_Hotspur_FC", fallback: "⚪⚫" },
  { code: "WHU", emojiName: "West_Ham_United_FC", fallback: "⚒️" },
  { code: "WOL", emojiName: "Wolverhampton_Wanderers_FC", fallback: "🟠⚫" }
];

async function buildEplTopBanner(interaction) {
  const guild = interaction?.guild;
  if (guild) {
    await primeEmojiCaches(guild);
  }

  const tokens = EPL_TEAM_TOKENS.map(({ code, emojiName, fallback }) => {
    const customEmoji = guild ? findEmojiByName(guild, emojiName) : null;
    const icon = customEmoji ? customEmoji.toString() : fallback;
    return `${icon} ${code}`;
  });

  return `${tokens.slice(0, 10).join("  ")}\n${tokens.slice(10).join("  ")}`;
}

module.exports = createQuickBetCommand({
  commandName: "bet-epl",
  commandDescription: "Đặt cược EPL",
  sport: "football",
  league: "epl",
  noMatchMessage: "No football matches are open for betting right now.",
  panelTitle: "Bet EPL 🏆",
  sessionExpiredMessage: "Session expired. Please run /bet-epl again.",
  topBanner: buildEplTopBanner
});
