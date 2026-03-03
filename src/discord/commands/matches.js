const { SlashCommandBuilder } = require("discord.js");
const Match = require("../../models/Match");
const { formatOdds, formatKickoff, buildEmbed, primeEmojiCaches, findEmojiByName } = require("./utils");

const FALLBACK_TEAM_EMOJI = "⚽";
const TEAM_EMOJI_BY_NAME = {
  Arsenal: "Arsenal_FC",
  "Manchester City": "MC_FC",
  "Manchester United": "MU_FC",
  "Aston Villa": "Aston_Villa_FC",
  Liverpool: "Liverpool_FC",
  Chelsea: "Chelsea_FC",
  Brentford: "Brentford_FC",
  Everton: "Everton_FC",
  Fulham: "Fulham_FC",
  "AFC Bournemouth": "Bournemouth_FC",
  Bournemouth: "Bournemouth_FC",
  "Brighton & Hove Albion": "Brighton_FC",
  Brighton: "Brighton_FC",
  Sunderland: "Sunderland_FC",
  "Newcastle United": "Newcastle_United_FC",
  Newcastle: "Newcastle_United_FC",
  "Crystal Palace": "Crystal_Palace_FC",
  "Leeds United": "Leeds_United_FC",
  Leeds: "Leeds_United_FC",
  "Tottenham Hotspur": "Tottenham_Hotspur_FC",
  Tottenham: "Tottenham_Hotspur_FC",
  Spurs: "Tottenham_Hotspur_FC",
  "Nottingham Forest": "Nottingham_Forest_FC",
  "West Ham United": "West_Ham_United_FC",
  "West Ham": "West_Ham_United_FC",
  Burnley: "Burnley_FC",
  "Wolverhampton Wanderers": "Wolverhampton_Wanderers_FC",
  Wolves: "Wolverhampton_Wanderers_FC"
};

function resolveTeamEmoji(guild, teamName) {
  if (!guild || !teamName) {
    return FALLBACK_TEAM_EMOJI;
  }

  const emojiName = TEAM_EMOJI_BY_NAME[teamName.trim()];
  if (!emojiName) {
    return FALLBACK_TEAM_EMOJI;
  }

  const emoji = findEmojiByName(guild, emojiName);
  return emoji ? emoji.toString() : FALLBACK_TEAM_EMOJI;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("matches")
    .setDescription("List open matches"),
  async execute(interaction) {
    await primeEmojiCaches(interaction.guild).catch(() => null);

    const matches = await Match.find({
      status: "open",
      betLocked: { $ne: true },
      kickoff: { $gt: new Date() }
    }).sort({ kickoff: 1 });
    if (matches.length === 0) {
      const embed = buildEmbed({
        title: "No open matches 🚫",
        description: "No games are open for betting right now. \ud83c\udfdb\ufe0f",
        color: 0x6ae4c5
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const description = matches
      .map((m) => {
        const kickoff = formatKickoff(m.kickoff);
        const oddsList = Array.isArray(m.odds) ? m.odds : [];
        const oneXTwo = oddsList.filter((item) => ["home", "draw", "away"].includes(item.key));
        const totals = oddsList.filter((item) => /^(big|small)\(/i.test(item.key));
        const homeEmoji = resolveTeamEmoji(interaction.guild, m.homeTeam);
        const awayEmoji = resolveTeamEmoji(interaction.guild, m.awayTeam);
        const oneXTwoText = oneXTwo.length ? formatOdds(oneXTwo) : "-";
        const totalsText = totals.length ? formatOdds(totals) : "Chưa có";
        return [
          `**${homeEmoji} ${m.homeTeam} vs ${awayEmoji} ${m.awayTeam}**`,
          `Code: ${m.matchCode ?? "-"}`,
          `Kickoff: ${kickoff}`,
          `Stadium: ${m.stadium || "-"} \ud83c\udfdf\ufe0f`,
          `Odds 1x2: ${oneXTwoText}`,
          `Odds T/X: ${totalsText}`
        ].join("\n");
      })
      .join("\n\n");

    const embed = buildEmbed({
      title: "Open matches \u26bd",
      description,
      color: 0xf6c244
    });

    return interaction.reply({ embeds: [embed] });
  }
};
