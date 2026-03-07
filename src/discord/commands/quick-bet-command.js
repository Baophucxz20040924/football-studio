const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags
} = require("discord.js");
const Match = require("../../models/Match");
const Bet = require("../../models/Bet");
const { buildEmbed, getOrCreateUser, formatPoints, normalizeAmount } = require("./utils");

const QUICK_AMOUNT_OPTIONS = [100, 500, 1000, 5000, 10000];
const SESSION_TIMEOUT_MS = 60000;

function truncate(value, max = 100) {
  const text = String(value || "").trim();
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

function formatAmountLabel(amount) {
  if (amount >= 1000000) {
    return `${Math.round(amount / 100000) / 10}M`;
  }

  if (amount >= 1000) {
    return `${Math.round(amount / 1000)}K`;
  }

  return String(amount);
}

function buildMatchSelect(matches, selectedMatchId, prefix) {
  const options = matches.slice(0, 25).map((match) => ({
    label: truncate(`${match.matchCode ?? "-"} | ${match.homeTeam} vs ${match.awayTeam}`, 100),
    description: truncate(`Kickoff: ${new Date(match.kickoff).toLocaleString("en-US")}`, 100),
    value: String(match._id),
    default: selectedMatchId === String(match._id)
  }));

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${prefix}:match`)
      .setPlaceholder("Select match")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options)
  );
}

function buildPickSelect(match, selectedPickKey, prefix) {
  const odds = Array.isArray(match?.odds) ? match.odds : [];
  const options = odds.slice(0, 25).map((odd) => ({
    label: truncate(`${odd.key} (x${odd.multiplier})`, 100),
    value: odd.key,
    default: selectedPickKey === odd.key
  }));

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${prefix}:pick`)
    .setPlaceholder(match ? "Select odds/pick" : "Select a match first")
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(!match || options.length === 0);

  if (options.length > 0) {
    menu.addOptions(options);
  } else {
    menu.addOptions({ label: "No odds available", value: "__none__" });
  }

  return new ActionRowBuilder().addComponents(menu);
}

function buildAmountRows(selectedAmount, disabled, prefix) {
  const presetRow = new ActionRowBuilder().addComponents(
    ...QUICK_AMOUNT_OPTIONS.map((amount) => (
      new ButtonBuilder()
        .setCustomId(`${prefix}:amt:${amount}`)
        .setLabel(formatAmountLabel(amount))
        .setStyle(selectedAmount === amount ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(disabled)
    ))
  );

  const customRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${prefix}:amt_custom`)
      .setLabel("Tùy chọn")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled)
  );

  return [presetRow, customRow];
}

function buildActionButtons(canConfirm, prefix, disabledAll = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${prefix}:confirm`)
      .setLabel("Confirm")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabledAll || !canConfirm),
    new ButtonBuilder()
      .setCustomId(`${prefix}:cancel`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabledAll)
  );
}

function buildQuickEmbed({ match, pickKey, amount, panelTitle, topBanner }) {
  const lines = [];

  if (topBanner) {
    lines.push(topBanner, "");
  }

  lines.push(
    `Match: **${match ? `${match.homeTeam} vs ${match.awayTeam}` : "(not selected)"}**`,
    `Pick: **${pickKey || "(not selected)"}**`,
    `Amount: **${amount ? formatPoints(amount) : "(not selected)"}**`
  );

  if (match?.matchCode !== undefined) {
    lines.splice(1, 0, `Code: **${match.matchCode}**`);
  }

  return buildEmbed({
    title: panelTitle,
    description: lines.join("\n"),
    color: 0x6ae4c5
  });
}

function buildComponentPayload(matches, selectedMatch, selectedPickKey, selectedAmount, config, disableAll = false) {
  const canConfirm = Boolean(selectedMatch && selectedPickKey && selectedAmount);
  return {
    embeds: [buildQuickEmbed({
      match: selectedMatch,
      pickKey: selectedPickKey,
      amount: selectedAmount,
      panelTitle: config.panelTitle,
      topBanner: config.topBanner
    })],
    components: [
      buildMatchSelect(matches, selectedMatch ? String(selectedMatch._id) : null, config.prefix),
      buildPickSelect(selectedMatch, selectedPickKey, config.prefix),
      ...buildAmountRows(selectedAmount, disableAll || !selectedMatch || !selectedPickKey, config.prefix),
      buildActionButtons(canConfirm, config.prefix, disableAll)
    ]
  };
}

async function resolveTopBanner(topBanner, interaction) {
  if (!topBanner) {
    return "";
  }

  if (typeof topBanner === "function") {
    const resolved = await topBanner(interaction);
    return typeof resolved === "string" ? resolved : "";
  }

  return typeof topBanner === "string" ? topBanner : "";
}

function createQuickBetCommand({
  commandName,
  commandDescription,
  sport,
  league,
  leagues,
  noMatchMessage,
  panelTitle,
  sessionExpiredMessage,
  topBanner = ""
}) {
  const prefix = commandName.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const config = {
    prefix,
    panelTitle,
    sessionExpiredMessage,
    topBanner
  };

  return {
    data: new SlashCommandBuilder()
      .setName(commandName)
      .setDescription(commandDescription),
    async execute(interaction) {
      const now = new Date();
      const openQuery = {
        sport,
        status: "open",
        betLocked: { $ne: true },
        isLive: { $ne: true },
        kickoff: { $gt: now }
      };

      if (Array.isArray(leagues) && leagues.length > 0) {
        openQuery.league = { $in: leagues };
      } else if (league) {
        openQuery.league = league;
      }

      const matches = await Match.find(openQuery).sort({ kickoff: 1 }).limit(25);
      if (matches.length === 0) {
        const embed = buildEmbed({
          title: "No open matches 🚫",
          description: noMatchMessage,
          color: 0xf36c5c
        });
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      let selectedMatch = null;
      let selectedPickKey = "";
      let selectedAmount = null;
      let finalized = false;
      const runtimeConfig = {
        ...config,
        topBanner: await resolveTopBanner(config.topBanner, interaction)
      };

      await interaction.reply(buildComponentPayload(matches, selectedMatch, selectedPickKey, selectedAmount, runtimeConfig));
      const replyMessage = await interaction.fetchReply();

      const collector = replyMessage.createMessageComponentCollector({
        time: SESSION_TIMEOUT_MS
      });

      collector.on("collect", async (componentInteraction) => {
        if (componentInteraction.user.id !== interaction.user.id) {
          await componentInteraction.reply({ content: "This panel belongs to another user.", flags: MessageFlags.Ephemeral });
          return;
        }

        if (componentInteraction.isStringSelectMenu()) {
          if (componentInteraction.customId === `${prefix}:match`) {
            const targetId = componentInteraction.values[0];
            const fresh = await Match.findOne({ _id: targetId, ...openQuery });

            selectedMatch = fresh || null;
            selectedPickKey = "";
            selectedAmount = null;

            await componentInteraction.update(
              buildComponentPayload(matches, selectedMatch, selectedPickKey, selectedAmount, runtimeConfig)
            );
            return;
          }

          if (componentInteraction.customId === `${prefix}:pick`) {
            if (!selectedMatch) {
              await componentInteraction.reply({ content: "Please select match first.", flags: MessageFlags.Ephemeral });
              return;
            }

            const pickKey = componentInteraction.values[0];
            if (pickKey === "__none__") {
              await componentInteraction.reply({ content: "No pick available for this match.", flags: MessageFlags.Ephemeral });
              return;
            }

            selectedPickKey = pickKey;
            selectedAmount = null;
            await componentInteraction.update(
              buildComponentPayload(matches, selectedMatch, selectedPickKey, selectedAmount, runtimeConfig)
            );
            return;
          }
        }

        if (!componentInteraction.isButton()) {
          return;
        }

        const [idPrefix, action, value] = componentInteraction.customId.split(":");
        if (idPrefix !== prefix) {
          return;
        }

        if (action === "cancel") {
          finalized = true;
          collector.stop("cancelled");
          await componentInteraction.update({
            embeds: [buildEmbed({ title: panelTitle, description: "Cancelled.", color: 0xf36c5c })],
            components: []
          });
          return;
        }

        if (action === "amt") {
          if (!selectedMatch || !selectedPickKey) {
            await componentInteraction.reply({ content: "Select match and pick first.", flags: MessageFlags.Ephemeral });
            return;
          }

          const parsed = Number(value);
          if (!Number.isFinite(parsed) || parsed <= 0) {
            await componentInteraction.reply({ content: "Invalid amount.", flags: MessageFlags.Ephemeral });
            return;
          }

          selectedAmount = Math.floor(parsed);
          await componentInteraction.update(
            buildComponentPayload(matches, selectedMatch, selectedPickKey, selectedAmount, runtimeConfig)
          );
          return;
        }

        if (action === "amt_custom") {
          if (!selectedMatch || !selectedPickKey) {
            await componentInteraction.reply({ content: "Select match and pick first.", flags: MessageFlags.Ephemeral });
            return;
          }

          const modalId = `${prefix}m:${interaction.id}:${componentInteraction.id}`;
          const modal = new ModalBuilder()
            .setCustomId(modalId)
            .setTitle("Custom bet amount");

          const amountInput = new TextInputBuilder()
            .setCustomId("amount")
            .setLabel("Amount (supports 10k, 1m)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder("e.g. 1000 or 10k");

          modal.addComponents(new ActionRowBuilder().addComponents(amountInput));

          await componentInteraction.showModal(modal);

          let submitted;
          try {
            submitted = await componentInteraction.awaitModalSubmit({
              time: SESSION_TIMEOUT_MS,
              filter: (i) => i.customId === modalId && i.user.id === componentInteraction.user.id
            });
          } catch {
            return;
          }

          const parsedAmount = normalizeAmount(submitted.fields.getTextInputValue("amount").trim());
          if (!parsedAmount) {
            await submitted.reply({ content: "Invalid amount.", flags: MessageFlags.Ephemeral });
            return;
          }

          selectedAmount = parsedAmount;
          await submitted.reply({
            content: `Selected amount: ${formatPoints(selectedAmount)}`,
            flags: MessageFlags.Ephemeral
          });

          await interaction.editReply(
            buildComponentPayload(matches, selectedMatch, selectedPickKey, selectedAmount, runtimeConfig)
          );
          return;
        }

        if (action === "confirm") {
          if (!selectedMatch || !selectedPickKey || !selectedAmount) {
            await componentInteraction.reply({ content: "Please complete all selections first.", flags: MessageFlags.Ephemeral });
            return;
          }

          const liveOpenQuery = {
            _id: selectedMatch._id,
            status: "open",
            betLocked: { $ne: true },
            isLive: { $ne: true },
            kickoff: { $gt: new Date() }
          };

          if (Array.isArray(leagues) && leagues.length > 0) {
            liveOpenQuery.league = { $in: leagues };
          } else if (league) {
            liveOpenQuery.league = league;
          }

          const match = await Match.findOne(liveOpenQuery);
          if (!match) {
            await componentInteraction.reply({ content: "Betting is locked for this match.", flags: MessageFlags.Ephemeral });
            return;
          }

          const odd = (match.odds || []).find((item) => item.key === selectedPickKey);
          if (!odd) {
            await componentInteraction.reply({ content: "Selected pick is no longer available.", flags: MessageFlags.Ephemeral });
            return;
          }

          const userName = componentInteraction.user.globalName || componentInteraction.user.username;
          const user = await getOrCreateUser(componentInteraction.user.id, userName);

          if (user.balance < selectedAmount) {
            await componentInteraction.reply({
              content: `Not enough balance. Current: ${formatPoints(user.balance)}`,
              flags: MessageFlags.Ephemeral
            });
            return;
          }

          user.balance -= selectedAmount;
          await user.save();

          await Bet.create({
            userId: componentInteraction.user.id,
            matchId: match._id,
            pickKey: selectedPickKey,
            amount: selectedAmount,
            multiplier: odd.multiplier
          });

          finalized = true;
          collector.stop("placed");

          await componentInteraction.update({
            embeds: [buildEmbed({
              title: "Bet placed 🎯",
              description: [
                `Match: **${match.homeTeam} vs ${match.awayTeam}**`,
                `Pick: **${selectedPickKey}** (x${odd.multiplier})`,
                `Amount: **${formatPoints(selectedAmount)}**`
              ].join("\n"),
              color: 0x6ae4c5
            })],
            components: []
          });
        }
      });

      collector.on("end", async () => {
        if (finalized) {
          return;
        }

        try {
          await interaction.editReply({
            embeds: [buildEmbed({
              title: panelTitle,
              description: sessionExpiredMessage,
              color: 0xf6c244
            })],
            components: []
          });
        } catch {
          // Ignore message update failures after timeout
        }
      });

      return null;
    }
  };
}

module.exports = {
  createQuickBetCommand
};
