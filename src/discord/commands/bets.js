const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const Bet = require("../../models/Bet");
const Match = require("../../models/Match");
const { buildEmbed, getOrCreateUser, formatPoints } = require("./utils");

const BETS_RETENTION_DAYS = 7;
const MAX_BETS_IN_REPLY = 10;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("bets")
    .setDescription("List your bets"),
  async execute(interaction) {
    const userName = interaction.user.globalName || interaction.user.username;
    await getOrCreateUser(interaction.user.id, userName);

    const staleBefore = new Date(Date.now() - BETS_RETENTION_DAYS * 24 * 60 * 60_000);
    await Bet.deleteMany({
      userId: interaction.user.id,
      status: { $in: ["won", "lost"] },
      createdAt: { $lt: staleBefore }
    });

    const bets = await Bet.find({ userId: interaction.user.id }).sort({ createdAt: -1 });
    const visibleBets = bets.slice(0, MAX_BETS_IN_REPLY);

    if (visibleBets.length === 0) {
      const embed = buildEmbed({
        title: "No open bets 💤",
        description: "You have no bets yet. \ud83c\udf43",
        color: 0x6ae4c5
      });
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    const matchIds = visibleBets.map((b) => b.matchId);
    const matches = await Match.find({ _id: { $in: matchIds } });
    const matchMap = new Map(matches.map((m) => [String(m._id), m]));

    const embeds = visibleBets.map((b) => {
      const match = matchMap.get(String(b.matchId));
      const sport = match?.sport === "basketball" ? "basketball" : "football";
      const league = String(match?.league || "").toLowerCase();
      const sportLabel = sport === "basketball"
        ? "🏀 NBA"
        : league === "laliga"
          ? "⚽ LaLiga"
          : league === "uefa"
            ? "⚽ UEFA Champions League"
          : league === "afc"
            ? "⚽ AFC Champions"
            : league === "afc_asian_cup"
              ? "⚽ AFC Asian Cup"
              : league === "ksa1"
                ? "⚽ Saudi Pro League"
            : "⚽ EPL";
      const label = match ? `${match.homeTeam} vs ${match.awayTeam}` : "Match";
      const score = match ? `${match.scoreHome ?? 0}-${match.scoreAway ?? 0}` : "-";
      const corner = sport === "football" && match
        ? `Corner: ${match.homeTeam}(${match.cornerHome ?? 0}) - ${match.awayTeam}(${match.cornerAway ?? 0})`
        : null;
      const potential = Math.round(b.amount * b.multiplier);
      const statusLabel = b.status === "open"
        ? "pending"
        : b.status === "won"
          ? "win"
          : "lose";
      const color = b.status === "open"
        ? 0xf6c244
        : b.status === "won"
          ? 0x22c55e
          : 0xf36c5c;

      const statusEmoji = b.status === "open"
        ? "\ud83d\udfe1"
        : b.status === "won"
          ? "\ud83d\udfe2"
          : "\ud83d\udd34";

      const descriptionLines = [
        `**${label}**`,
        `Sport: ${sportLabel}`,
        `Status: ${statusEmoji} **${statusLabel}** | Score: ${score}`,
        `Pick: ${b.pickKey} (x${b.multiplier}) \u26bd`,
        `Stake: ${formatPoints(b.amount)} | Win: ${formatPoints(potential)} \ud83d\udcb0`
      ];

      if (corner) {
        descriptionLines.splice(3, 0, corner);
      }

      const description = descriptionLines.join("\n");

      return buildEmbed({
        title: "Your bet \u26bd",
        description,
        color
      });
    });

    return interaction.reply({ embeds, flags: MessageFlags.Ephemeral });
  }
};
