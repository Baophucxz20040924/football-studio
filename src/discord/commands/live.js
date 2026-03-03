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
    .setName("live")
    .setDescription("List live matches"),
  async execute(interaction) {
    const matches = await Match.find({ status: "open", isLive: true }).sort({ kickoff: 1 });
    if (matches.length === 0) {
      const embed = buildEmbed({
        title: "No live matches ⏳",
        description: "No games are live right now. \ud83d\udcf4",
        color: 0xf36c5c
      });
      return interaction.reply({ embeds: [embed] });
    }

    const description = matches
      .map((match) => {
        const sport = match.sport === "basketball" ? "basketball" : "football";
        const sportLabel = sport === "basketball" ? "🏀 NBA" : "⚽ Football";
        const score = `${match.scoreHome ?? 0}-${match.scoreAway ?? 0}`;
        const lines = [
          `**${match.homeTeam} vs ${match.awayTeam}**`,
          `Sport: ${sportLabel}`,
          `Score: ${score} 🔥`
        ];

        if (sport === "football") {
          const corner = `Corner: ${match.homeTeam}(${match.cornerHome ?? 0}) - ${match.awayTeam}(${match.cornerAway ?? 0})`;
          const goals = formatGoals(match.goals);
          lines.push(corner, goals);
        }

        return lines.join("\n");
      })
      .join("\n\n");

    const embed = buildEmbed({
      title: "Live matches \ud83d\udd34",
      description,
      color: 0xf36c5c
    });

    return interaction.reply({ embeds: [embed] });
  }
};
