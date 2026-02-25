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
    const now = new Date();

    if (!amount) {
      const embed = buildEmbed({
        title: "Invalid amount ❌",
        description: "Please enter a positive number. 💸",
        color: 0xf36c5c
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    let match = null;
    const openBettingQuery = {
      status: "open",
      betLocked: { $ne: true },
      kickoff: { $gt: now }
    };

    if (/^\d{1,6}$/.test(matchRef)) {
      match = await Match.findOne({ matchCode: Number(matchRef), ...openBettingQuery });
    } else if (/^[a-f0-9]{24}$/i.test(matchRef)) {
      match = await Match.findOne({ _id: matchRef, ...openBettingQuery });
    }

    if (!match) {
      let existingMatch = null;
      if (/^\d{1,6}$/.test(matchRef)) {
        existingMatch = await Match.findOne({ matchCode: Number(matchRef) });
      } else if (/^[a-f0-9]{24}$/i.test(matchRef)) {
        existingMatch = await Match.findById(matchRef);
      }

      if (existingMatch && existingMatch.status === "open") {
        const kickoffTime = new Date(existingMatch.kickoff).getTime();
        if (existingMatch.betLocked || (Number.isFinite(kickoffTime) && kickoffTime <= Date.now())) {
          if (!existingMatch.betLocked) {
            existingMatch.betLocked = true;
            await existingMatch.save();
          }

          const embed = buildEmbed({
            title: "Betting is locked 🔒",
            description: "Match has reached kickoff time, betting is now closed. ⏰",
            color: 0xf36c5c
          });
          return interaction.reply({ embeds: [embed], ephemeral: true });
        }
      }

      const embed = buildEmbed({
        title: "Match not found 🗓️",
        description: "This match is closed or does not exist. 🗓️",
        color: 0xf36c5c
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const odd = match.odds.find((o) => o.key === pickKey);
    if (!odd) {
      const embed = buildEmbed({
        title: "Invalid pick ❗",
        description: `Available odds: ${formatOdds(match.odds)} ⚽`,
        color: 0xf36c5c
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const userName = interaction.user.globalName || interaction.user.username;
    const user = await getOrCreateUser(interaction.user.id, userName);
    if (user.balance < amount) {
      const embed = buildEmbed({
        title: "Not enough balance 💸",
        description: `Current balance: ${formatPoints(user.balance)} 💵`,
        color: 0xf36c5c
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const lockCheck = await Match.findOne({
      _id: match._id,
      status: "open",
      betLocked: { $ne: true },
      kickoff: { $gt: new Date() }
    }).select("_id");

    if (!lockCheck) {
      const latest = await Match.findById(match._id).select("betLocked kickoff status");
      if (latest && latest.status === "open" && !latest.betLocked) {
        const kickoffTime = new Date(latest.kickoff).getTime();
        if (Number.isFinite(kickoffTime) && kickoffTime <= Date.now()) {
          latest.betLocked = true;
          await latest.save();
        }
      }

      const embed = buildEmbed({
        title: "Betting is locked 🔒",
        description: "Match has reached kickoff time, betting is now closed. ⏰",
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
      title: "Bet placed ⚽",
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
