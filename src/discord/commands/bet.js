const { SlashCommandBuilder } = require("discord.js");
const Match = require("../../models/Match");
const Bet = require("../../models/Bet");
const { formatOdds, buildEmbed, normalizeAmount, getOrCreateUser, formatPoints } = require("./utils");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("bet")
    .setDescription("Place a bet")
    .addStringOption((opt) =>
      opt.setName("match_code").setDescription("Match code").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("pick_key").setDescription("Odds key").setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName("amount").setDescription("Bet amount").setRequired(true)
    ),
  async execute(interaction) {
    const matchRef = interaction.options.getString("match_code", true).trim();
    const pickKey = interaction.options.getString("pick_key", true).trim();
    const amount = normalizeAmount(interaction.options.getInteger("amount", true));

    if (!amount) {
      const embed = buildEmbed({
        title: "Invalid amount ❌",
        description: "Please enter a positive number. \ud83d\udcb8",
        color: 0xf36c5c
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    let match = null;
    if (/^\d{1,6}$/.test(matchRef)) {
      match = await Match.findOne({ matchCode: Number(matchRef) });
    } else if (/^[a-f0-9]{24}$/i.test(matchRef)) {
      match = await Match.findById(matchRef);
    }
    if (!match || match.status !== "open") {
      const embed = buildEmbed({
        title: "Match not found 🗓️",
        description: "This match is closed or does not exist. \ud83d\uddd3\ufe0f",
        color: 0xf36c5c
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (match.betLocked) {
      const embed = buildEmbed({
        title: "Betting is locked 🔒",
        description: "This match is temporarily locked for betting. \ud83d\udd12",
        color: 0xf36c5c
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

      const kickoffTime = match.kickoff ? new Date(match.kickoff).getTime() : 0;
      if (kickoffTime && kickoffTime <= Date.now()) {
        match.betLocked = true;
        await match.save();

        const embed = buildEmbed({
          title: "Betting is locked 🔒",
          description: "Match has reached kickoff time, betting is now closed. ⏰",
          color: 0xf36c5c
        });
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

    const odd = match.odds.find((o) => o.key === pickKey);
    if (!odd) {
      const embed = buildEmbed({
        title: "Invalid pick ❗",
        description: `Available odds: ${formatOdds(match.odds)} \u26bd`,
        color: 0xf36c5c
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const userName = interaction.user.globalName || interaction.user.username;
    const user = await getOrCreateUser(interaction.user.id, userName);
    if (user.balance < amount) {
      const embed = buildEmbed({
        title: "Not enough balance 💸",
        description: `Current balance: ${formatPoints(user.balance)} \ud83d\udcb5`,
        color: 0xf36c5c
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    user.balance -= amount;
    await user.save();

    await Bet.create({
      userId: interaction.user.id,
      matchId: match._id,
      pickKey,
      amount,
      multiplier: odd.multiplier
    });

    const embed = buildEmbed({
      title: "Bet placed \u26bd",
      description: [
        `Match: **${match.homeTeam} vs ${match.awayTeam}**`,
        `Pick: **${pickKey}** (x${odd.multiplier})`,
        `Amount: **${formatPoints(amount)}**`
      ].join("\n"),
      color: 0x6ae4c5
    });

    return interaction.reply({ embeds: [embed] });
  }
};
