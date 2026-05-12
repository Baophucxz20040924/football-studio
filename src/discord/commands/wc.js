const {
  SlashCommandBuilder,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const Match = require("../../models/Match");
const { formatOdds, formatKickoff, buildEmbed } = require("./utils");

const EMBED_DESCRIPTION_MAX = 4096;
const PAGE_SESSION_TIMEOUT_MS = 60_000;

function chunkDescriptions(items, separator = "\n\n", maxLength = EMBED_DESCRIPTION_MAX) {
  const chunks = [];
  let current = "";

  for (const item of items) {
    const candidate = current ? `${current}${separator}${item}` : item;
    if (candidate.length <= maxLength) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = "";
    }

    if (item.length <= maxLength) {
      current = item;
      continue;
    }

    let offset = 0;
    while (offset < item.length) {
      chunks.push(item.slice(offset, offset + maxLength));
      offset += maxLength;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function buildPageEmbed({ description, page, totalPages }) {
  const embed = buildEmbed({
    title: totalPages > 1
      ? `Open FIFA World Cup 2026 matches ⚽ (${page}/${totalPages})`
      : "Open FIFA World Cup 2026 matches ⚽",
    description,
    color: 0xf6c244
  });

  if (totalPages > 1) {
    embed.setFooter({ text: `Page ${page}/${totalPages}` });
  }

  return embed;
}

function buildPageButtons(page, totalPages, disabled = false) {
  if (totalPages <= 1) {
    return [];
  }

  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("wc:prev")
      .setLabel("Prev")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || page <= 1),
    new ButtonBuilder()
      .setCustomId("wc:next")
      .setLabel("Next")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || page >= totalPages),
    new ButtonBuilder()
      .setCustomId("wc:close")
      .setLabel("Close")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
  )];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("wc")
    .setDescription("List open FIFA World Cup 2026 matches"),
  async execute(interaction) {
    const matches = await Match.find({
      sport: "football",
      league: "worldcup_2026",
      status: "open",
      betLocked: { $ne: true },
      kickoff: { $gt: new Date() }
    }).sort({ kickoff: 1 });

    if (matches.length === 0) {
      const embed = buildEmbed({
        title: "No open World Cup matches ⚽",
        description: "No FIFA World Cup 2026 games are open for betting right now.",
        color: 0x6ae4c5
      });
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    const blocks = matches.map((m) => {
      const kickoff = formatKickoff(m.kickoff);
      const oddsList = Array.isArray(m.odds) ? m.odds : [];
      const oneXTwo = oddsList.filter((item) => ["home", "draw", "away"].includes(item.key));
      const totals = oddsList.filter((item) => /^(big|small)\(/i.test(item.key));
      const oneXTwoText = oneXTwo.length ? formatOdds(oneXTwo) : "-";
      const totalsText = totals.length ? formatOdds(totals) : "-";

      return [
        `**${m.homeTeam} vs ${m.awayTeam}**`,
        `Code: ${m.matchCode ?? "-"}`,
        `Kickoff: ${kickoff}`,
        `Stadium: ${m.stadium || "-"} 🏟️`,
        `Odds 1x2: ${oneXTwoText}`,
        `Odds O/U: ${totalsText}`
      ].join("\n");
    });

    const descriptions = chunkDescriptions(blocks);
    const totalPages = descriptions.length;
    let currentPage = 1;

    const renderPayload = (page, disabled = false) => ({
      embeds: [buildPageEmbed({
        description: descriptions[page - 1] || "No data.",
        page,
        totalPages
      })],
      components: buildPageButtons(page, totalPages, disabled)
    });

    await interaction.reply(renderPayload(currentPage));
    const replyMessage = await interaction.fetchReply();

    const collector = replyMessage.createMessageComponentCollector({
      time: PAGE_SESSION_TIMEOUT_MS
    });

    collector.on("collect", async (btn) => {
      if (btn.user.id !== interaction.user.id) {
        await btn.reply({ content: "This panel belongs to another user.", flags: MessageFlags.Ephemeral });
        return;
      }

      if (!btn.isButton()) {
        return;
      }

      if (btn.customId === "wc:close") {
        collector.stop("closed");
        await btn.update({
          embeds: [buildEmbed({
            title: "Open FIFA World Cup 2026 matches ⚽",
            description: "Closed.",
            color: 0xf36c5c
          })],
          components: []
        });
        return;
      }

      if (btn.customId === "wc:prev") {
        currentPage = Math.max(1, currentPage - 1);
      } else if (btn.customId === "wc:next") {
        currentPage = Math.min(totalPages, currentPage + 1);
      } else {
        return;
      }

      await btn.update(renderPayload(currentPage));
    });

    collector.on("end", async () => {
      try {
        await interaction.editReply(renderPayload(currentPage, true));
      } catch {
        // Ignore message update failures after timeout
      }
    });

    return null;
  }
};
