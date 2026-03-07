const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const Match = require("../../models/Match");
const { formatOdds, formatKickoff, buildEmbed } = require("./utils");

const EMBED_DESCRIPTION_MAX = 4096;
const EMBEDS_PER_MESSAGE_MAX = 10;
const ASIA_LEAGUES = ["afc_asian_cup", "ksa1"];

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

function formatLeagueTag(league) {
  if (league === "afc_asian_cup") {
    return "AFC Asian Cup";
  }

  if (league === "ksa1") {
    return "Saudi Pro League";
  }

  return "Asia";
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("asia")
    .setDescription("List open Asia matches (AFC Asian Cup + KSA)"),
  async execute(interaction) {
    const matches = await Match.find({
      sport: "football",
      league: { $in: ASIA_LEAGUES },
      status: "open",
      betLocked: { $ne: true },
      kickoff: { $gt: new Date() }
    }).sort({ kickoff: 1 });

    if (matches.length === 0) {
      const embed = buildEmbed({
        title: "No open Asia matches ⚽",
        description: "No Asia games are open for betting right now.",
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
      const leagueTag = formatLeagueTag(String(m.league || "").toLowerCase());

      return [
        `**${m.homeTeam} vs ${m.awayTeam}**`,
        `League: ${leagueTag}`,
        `Code: ${m.matchCode ?? "-"}`,
        `Kickoff: ${kickoff}`,
        `Stadium: ${m.stadium || "-"} 🏟️`,
        `Odds 1x2: ${oneXTwoText}`,
        `Odds O/U: ${totalsText}`
      ].join("\n");
    });

    const descriptions = chunkDescriptions(blocks);
    const embeds = descriptions.map((description, index) => buildEmbed({
      title: descriptions.length > 1
        ? `Open Asia matches 🌏 (${index + 1}/${descriptions.length})`
        : "Open Asia matches 🌏",
      description,
      color: 0xf6c244
    }));

    await interaction.reply({ embeds: embeds.slice(0, EMBEDS_PER_MESSAGE_MAX) });

    for (let i = EMBEDS_PER_MESSAGE_MAX; i < embeds.length; i += EMBEDS_PER_MESSAGE_MAX) {
      await interaction.followUp({ embeds: embeds.slice(i, i + EMBEDS_PER_MESSAGE_MAX) });
    }

    return null;
  }
};
