const { SlashCommandBuilder } = require("discord.js");
const { primeEmojiCaches, findEmojiByName } = require("./utils");

const ESPN_EPL_STANDINGS_URL = "https://site.api.espn.com/apis/v2/sports/soccer/eng.1/standings";
const FETCH_TIMEOUT_MS = 8000;
const MAX_ROWS = 20;
const FALLBACK_TEAM_EMOJI = "⚽";
const TEAM_EMOJI_BY_NAME = {
  Arsenal: "Arsenal_FC",
  "Manchester City": "MC_FC",
  "Manchester United": "MU_FC",
  "Aston Villa": "Aston_Villa_FC",
  Liverpool: "Liverpool_FC",
  Chelsea: "Chelsea_FC",
  Brentford: "Brentford_FC",
  Everton: "Everton_FC",
  Fulham: "Fulham_FC",
  "AFC Bournemouth": "Bournemouth_FC",
  "Brighton & Hove Albion": "Brighton_FC",
  Sunderland: "Sunderland_FC",
  "Newcastle United": "Newcastle_United_FC",
  "Crystal Palace": "Crystal_Palace_FC",
  "Leeds United": "Leeds_United_FC",
  "Tottenham Hotspur": "Tottenham_Hotspur_FC",
  "Nottingham Forest": "Nottingham_Forest_FC",
  "West Ham United": "West_Ham_United_FC",
  Burnley: "Burnley_FC",
  "Wolverhampton Wanderers": "Wolverhampton_Wanderers_FC"
};

function getEntryStatsMap(entry) {
  const stats = Array.isArray(entry?.stats) ? entry.stats : [];
  return stats.reduce((acc, stat) => {
    if (!stat?.name) {
      return acc;
    }
    acc[stat.name] = stat;
    return acc;
  }, {});
}

function toRankValue(entry, statsMap) {
  const rankFromStats = Number(statsMap?.rank?.value);
  if (Number.isFinite(rankFromStats)) {
    return rankFromStats;
  }

  const rankFromNote = Number(entry?.note?.rank);
  if (Number.isFinite(rankFromNote)) {
    return rankFromNote;
  }

  return Number.POSITIVE_INFINITY;
}

function toNumeric(stat) {
  if (Number.isFinite(stat?.value)) {
    return Math.trunc(stat.value);
  }

  const parsed = Number(stat?.displayValue);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function normalizeGd(value) {
  if (!Number.isFinite(value)) {
    return "0";
  }

  if (value > 0) {
    return `+${value}`;
  }

  return String(value);
}

function resolveTeamEmoji(guild, teamName) {
  if (!guild || !teamName) {
    return FALLBACK_TEAM_EMOJI;
  }

  const emojiName = TEAM_EMOJI_BY_NAME[teamName];
  if (!emojiName) {
    return FALLBACK_TEAM_EMOJI;
  }

  const emoji = findEmojiByName(guild, emojiName);
  return emoji ? emoji.toString() : FALLBACK_TEAM_EMOJI;
}

function formatRankLine(row, guild) {
  const emoji = resolveTeamEmoji(guild, row.teamName);
  return `${row.rank}. ${emoji} **${row.teamName}** — ${row.points}đ | ${row.played} trận | ${row.wins}-${row.draws}-${row.losses} | GD ${row.gd}`;
}

function parseStandings(payload) {
  const child = payload?.children?.[0];
  const standings = child?.standings;
  const entries = Array.isArray(standings?.entries) ? standings.entries : [];

  const rows = entries
    .map((entry) => {
      const statsMap = getEntryStatsMap(entry);
      const teamName = entry?.team?.displayName || entry?.team?.name || "Unknown";
      const rank = toNumeric(statsMap.rank);
      const played = toNumeric(statsMap.gamesPlayed);
      const wins = toNumeric(statsMap.wins);
      const draws = toNumeric(statsMap.ties);
      const losses = toNumeric(statsMap.losses);
      const gd = toNumeric(statsMap.pointDifferential);
      const points = toNumeric(statsMap.points);

      return {
        sortRank: toRankValue(entry, statsMap),
        rank,
        teamName,
        points,
        played,
        wins,
        draws,
        losses,
        gd: normalizeGd(gd)
      };
    })
    .sort((a, b) => a.sortRank - b.sortRank)
    .slice(0, MAX_ROWS);

  return {
    rows,
    season: standings?.seasonDisplayName || child?.name || payload?.name || "Premier League"
  };
}

async function fetchEplStandings() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(ESPN_EPL_STANDINGS_URL, {
      signal: controller.signal,
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    return parseStandings(payload);
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("epl-rank")
    .setDescription("Xem BXH Premier League mới nhất (ESPN)"),
  async execute(interaction) {
    await interaction.deferReply();

    try {
      await primeEmojiCaches(interaction.guild).catch(() => null);
      const data = await fetchEplStandings();
      if (!data.rows.length) {
        await interaction.editReply("Không lấy được dữ liệu BXH Premier League lúc này.");
        return;
      }

      const topHalf = data.rows.slice(0, 10).map((row) => formatRankLine(row, interaction.guild));
      const bottomHalf = data.rows.slice(10).map((row) => formatRankLine(row, interaction.guild));

      await interaction.editReply({
        embeds: [
          {
            color: 0x1d428a,
            title: `🏆 EPL Ranking - ${data.season}`,
            description: topHalf.join("\n"),
            fields: bottomHalf.length
              ? [
                  {
                    name: " ",
                    value: bottomHalf.join("\n")
                  }
                ]
              : undefined,
            timestamp: new Date().toISOString()
          }
        ]
      });
    } catch (error) {
      console.error("epl-rank command error:", error);
      await interaction.editReply("Lỗi khi lấy BXH EPL từ ESPN. Thử lại sau nhé.");
    }
  }
};