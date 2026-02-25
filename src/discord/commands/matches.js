const { SlashCommandBuilder } = require("discord.js");
const Match = require("../../models/Match");
const { formatOdds, formatKickoff, buildEmbed } = require("./utils");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("matches")
    .setDescription("List open matches"),
  async execute(interaction) {
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
        const odds = formatOdds(m.odds);
        return [
          `**${m.homeTeam} vs ${m.awayTeam}**`,
          `Code: ${m.matchCode ?? "-"}`,
          `Kickoff: ${kickoff}`,
          `Stadium: ${m.stadium || "-"} \ud83c\udfdf\ufe0f`,
          `Odds: ${odds}`
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
