const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const Match = require("../../models/Match");
const { formatOdds, formatKickoff, buildEmbed } = require("./utils");

const MAX_NBA_MATCHES = 5;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("nba")
    .setDescription("List open NBA matches"),
  async execute(interaction) {
    const matches = await Match.find({
      sport: "basketball",
      league: "nba",
      status: "open",
      betLocked: { $ne: true },
      kickoff: { $gt: new Date() }
    })
      .sort({ kickoff: 1 })
      .limit(MAX_NBA_MATCHES);

    if (matches.length === 0) {
      const embed = buildEmbed({
        title: "No open NBA matches 🏀",
        description: "No NBA games are open for betting right now.",
        color: 0x6ae4c5
      });
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    const description = matches
      .map((m) => {
        const kickoff = formatKickoff(m.kickoff);
        const oddsList = Array.isArray(m.odds) ? m.odds : [];
        const moneyline = oddsList.filter((item) => ["home", "away"].includes(item.key));
        const totals = oddsList.filter((item) => /^(big|small)\(/i.test(item.key));
        const moneylineText = moneyline.length ? formatOdds(moneyline) : "-";
        const totalsText = totals.length ? formatOdds(totals) : "-";

        return [
          `**${m.homeTeam} vs ${m.awayTeam}**`,
          `Code: ${m.matchCode ?? "-"}`,
          `Tip-off: ${kickoff}`,
          `Arena: ${m.stadium || "-"} 🏟️`,
          `Odds ML: ${moneylineText}`,
          `Odds O/U: ${totalsText}`
        ].join("\n");
      })
      .join("\n\n");

    const embed = buildEmbed({
      title: `Open NBA matches 🏀`,
      description,
      color: 0xf6c244
    });

    return interaction.reply({ embeds: [embed] });
  }
};
