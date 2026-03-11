const { SlashCommandBuilder } = require("discord.js");
const Match = require("../../models/Match");
const { buildEmbed } = require("./utils");

function formatGoals(goals) {
  if (!Array.isArray(goals) || goals.length === 0) {
    return "Goal: -";
  }

  return goals
    .map((goal) => {
      const minute = Number.isFinite(goal.minute) ? ` (${goal.minute}')` : "";
      return `Goal: ${goal.scorer} - ${goal.team}${minute}`;
    })
    .join("\n");
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("live-uefa")
    .setDescription("List live UEFA Champions League matches"),
  async execute(interaction) {
    const matches = await Match.find({
      sport: "football",
      league: "uefa",
      status: "open",
      isLive: true
    }).sort({ kickoff: 1 });

    if (matches.length === 0) {
      const embed = buildEmbed({
        title: "No live UEFA Champions League matches ⏳",
        description: "No UEFA Champions League games are live right now. 📴",
        color: 0xf36c5c
      });
      return interaction.reply({ embeds: [embed] });
    }

    const description = matches
      .map((match) => {
        const score = `${match.scoreHome ?? 0}-${match.scoreAway ?? 0}`;
        const corner = `Corner: ${match.homeTeam}(${match.cornerHome ?? 0}) - ${match.awayTeam}(${match.cornerAway ?? 0})`;
        const goals = formatGoals(match.goals);

        return [
          `**${match.homeTeam} vs ${match.awayTeam}**`,
          `Score: ${score} 🔥`,
          corner,
          goals
        ].join("\n");
      })
      .join("\n\n");

    const embed = buildEmbed({
      title: "Live UEFA Champions League matches 🔴",
      description,
      color: 0xf36c5c
    });

    return interaction.reply({ embeds: [embed] });
  }
};