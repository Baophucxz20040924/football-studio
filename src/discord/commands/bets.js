const { SlashCommandBuilder } = require("discord.js");
const Bet = require("../../models/Bet");
const Match = require("../../models/Match");
const { buildEmbed, getOrCreateUser } = require("./utils");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("bets")
    .setDescription("List your bets"),
  async execute(interaction) {
    const userName = interaction.user.globalName || interaction.user.username;
    await getOrCreateUser(interaction.user.id, userName);

    const bets = await Bet.find({ userId: interaction.user.id }).sort({ createdAt: -1 });
    if (bets.length > 20) {
      const stale = bets.slice(20);
      await Bet.deleteMany({ _id: { $in: stale.map((b) => b._id) } });
      bets.splice(20);
    }

    if (bets.length === 0) {
      const embed = buildEmbed({
        title: "No open bets",
        description: "You have no bets yet. \ud83c\udf43",
        color: 0x6ae4c5
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const matchIds = bets.map((b) => b.matchId);
    const matches = await Match.find({ _id: { $in: matchIds } });
    const matchMap = new Map(matches.map((m) => [String(m._id), m]));

    const embeds = bets.map((b) => {
      const match = matchMap.get(String(b.matchId));
      const label = match ? `${match.homeTeam} vs ${match.awayTeam}` : "Match";
      const score = match ? `${match.scoreHome ?? 0}-${match.scoreAway ?? 0}` : "-";
      const corner = match
        ? `Corner: ${match.homeTeam}(${match.cornerHome ?? 0}) - ${match.awayTeam}(${match.cornerAway ?? 0})`
        : "Corner: -";
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

      const description = [
        `**${label}**`,
        `Status: ${statusEmoji} **${statusLabel}** | Score: ${score}`,
        corner,
        `Pick: ${b.pickKey} (x${b.multiplier}) \u26bd`,
        `Stake: ${b.amount} | Win: ${potential} \ud83d\udcb0`
      ].join("\n");

      return buildEmbed({
        title: "Your bet \u26bd",
        description,
        color
      });
    });

    return interaction.reply({ embeds, ephemeral: true });
  }
};
