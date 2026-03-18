const { SlashCommandBuilder } = require("discord.js");
const Match = require("../../models/Match");
const { buildEmbed, buildPagedEmbeds } = require("./utils");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("live-nba")
    .setDescription("List live NBA matches"),
  async execute(interaction) {
    const matches = await Match.find({
      sport: "basketball",
      league: "nba",
      status: "open",
      isLive: true
    }).sort({ kickoff: 1 });

    if (matches.length === 0) {
      const embed = buildEmbed({
        title: "No live NBA matches ⏳",
        description: "No NBA games are live right now. 📴",
        color: 0xf36c5c
      });
      return interaction.reply({ embeds: [embed] });
    }

    const sections = matches
      .map((match) => {
        const score = `${match.scoreHome ?? 0}-${match.scoreAway ?? 0}`;

        return [
          `**${match.homeTeam} vs ${match.awayTeam}**`,
          `Score: ${score} 🔥`
        ].join("\n");
      });

    const embeds = buildPagedEmbeds({
      title: "Live NBA matches 🔴",
      sections,
      color: 0xf36c5c,
      emptyDescription: "No NBA games are live right now. 📴"
    });

    return interaction.reply({ embeds });
  }
};
