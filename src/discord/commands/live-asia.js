const { SlashCommandBuilder } = require("discord.js");
const Match = require("../../models/Match");
const { buildEmbed, buildPagedEmbeds } = require("./utils");

const ASIA_LEAGUES = ["afc_asian_cup", "ksa1"];

function formatLeagueTag(league) {
  if (league === "afc_asian_cup") {
    return "AFC Asian Cup";
  }

  if (league === "ksa1") {
    return "Saudi Pro League";
  }

  return "Asia";
}

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
    .setName("live-asia")
    .setDescription("List live Asia matches (AFC Asian Cup + KSA)"),
  async execute(interaction) {
    const matches = await Match.find({
      sport: "football",
      league: { $in: ASIA_LEAGUES },
      status: "open",
      isLive: true
    }).sort({ kickoff: 1 });

    if (matches.length === 0) {
      const embed = buildEmbed({
        title: "No live Asia matches ⏳",
        description: "No Asia games are live right now. 📴",
        color: 0xf36c5c
      });
      return interaction.reply({ embeds: [embed] });
    }

    const sections = matches
      .map((match) => {
        const score = `${match.scoreHome ?? 0}-${match.scoreAway ?? 0}`;
        const corner = `Corner: ${match.homeTeam}(${match.cornerHome ?? 0}) - ${match.awayTeam}(${match.cornerAway ?? 0})`;
        const goals = formatGoals(match.goals);
        const leagueTag = formatLeagueTag(String(match.league || "").toLowerCase());

        return [
          `**${match.homeTeam} vs ${match.awayTeam}**`,
          `League: ${leagueTag}`,
          `Score: ${score} 🔥`,
          corner,
          goals
        ].join("\n");
      });

    const embeds = buildPagedEmbeds({
      title: "Live Asia matches 🔴",
      sections,
      color: 0xf36c5c,
      emptyDescription: "No Asia games are live right now. 📴"
    });

    return interaction.reply({ embeds });
  }
};
