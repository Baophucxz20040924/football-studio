const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");
const {
  buildEmbed,
  normalizeAmount,
  getOrCreateUser,
  formatPoints,
  primeEmojiCaches,
  findEmojiByName
} = require("./utils");
const { acquireChannelGameLock, releaseChannelGameLock } = require("./channelLocks");

const BET_WINDOW_MS = 30_000;
const MAX_IDLE_ROUNDS = 2;
const HOME_PAYOUT_MULTIPLIER = 2;
const DRAW_PAYOUT_MULTIPLIER = 11;
const CARD_ORDER = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const CARD_SUITS = ["spades", "hearts", "diamonds", "clubs"];
const CARD_SUIT_EMOJIS = {
  spades: process.env.CARD_EMOJI_SPADES || "♠️",
  hearts: process.env.CARD_EMOJI_HEARTS || "♥️",
  diamonds: process.env.CARD_EMOJI_DIAMONDS || "♦️",
  clubs: process.env.CARD_EMOJI_CLUBS || "♣️"
};
const RANK_WORD_NAMES = {
  A: "ace",
  "2": "two",
  "3": "three",
  "4": "four",
  "5": "five",
  "6": "six",
  "7": "seven",
  "8": "eight",
  "9": "nine",
  "10": "ten",
  J: "jack",
  Q: "queen",
  K: "king"
};
const SPIN_FRAMES = ["⚽️↩️", "⚽️↪️"];
const REVEAL_TICK_MS = 700;
const REVEAL_TICKS = 4;
const CARD_REVEAL_DELAY_MS = 1_500;
const FACE_DOWN_CARD_FALLBACK = "🎴";
const TEAM_EMOJI_NAMES = [
  "Wolverhampton_Wanderers_FC",
  "Nottingham_Forest_FC",
  "Tottenham_Hotspur_FC",
  "Brighton_FC",
  "Crystal_Palace_FC",
  "Fulham_FC",
  "Sunderland_FC",
  "Newcastle_United_FC",
  "Bournemouth_FC",
  "Everton_FC",
  "Brentford_FC",
  "Liverpool_FC",
  "Chelsea_FC",
  "Aston_Villa_FC",
  "MC_FC",
  "Arsenal_FC",
  "MU_FC"
];

const sessions = new Map();
let sessionCounter = 0;

function drawCard() {
  const index = Math.floor(Math.random() * CARD_ORDER.length);
  const suitIndex = Math.floor(Math.random() * CARD_SUITS.length);
  const rank = CARD_ORDER[index];
  const suit = CARD_SUITS[suitIndex];
  return { rank, suit, value: index + 2 };
}

function buildCardEmojiCandidates(rank, suit) {
  const rankWordName = RANK_WORD_NAMES[rank];
  const rankLower = String(rank).toLowerCase();
  const isFace = ["J", "Q", "K"].includes(rank);
  const suffixes = isFace ? ["2", ""] : [""];
  const rankTokens = [];

  if (rankWordName) {
    rankTokens.push(rankWordName);
  }

  rankTokens.push(rankLower);

  if (/^\d+$/.test(rankLower)) {
    rankTokens.push(rankLower);
  }

  return [...new Set(rankTokens.flatMap((token) => suffixes.map((suffix) => `${token}_of_${suit}${suffix}`)))];
}

function resolveCustomCardEmoji(guild, rank, suit) {
  if (!guild) {
    return null;
  }

  const candidates = buildCardEmojiCandidates(rank, suit);
  for (const emojiName of candidates) {
    const emoji = findEmojiByName(guild, emojiName);
    if (emoji) {
      return emoji.toString();
    }
  }

  return null;
}

function formatCardDisplay(card, guild) {
  const customEmoji = resolveCustomCardEmoji(guild, card.rank, card.suit);
  if (customEmoji) {
    return customEmoji;
  }

  const fallbackSuitEmoji = CARD_SUIT_EMOJIS[card.suit] || "";
  return `${card.rank}${fallbackSuitEmoji}`;
}

function isCustomEmoji(value) {
  return /^<a?:\w+:\d+>$/.test(value);
}

function buildJumboFootballBoard(homeDisplay, awayDisplay) {
  if (!isCustomEmoji(homeDisplay) || !isCustomEmoji(awayDisplay)) {
    return null;
  }

  return `⚽ Trận đấu: ${homeDisplay} vs ${awayDisplay}`;
}

function getRandomTeamMatchup(guild) {
  if (!guild) {
    return { homeTeamDisplay: "🏠", awayTeamDisplay: "🛫" };
  }

  const available = TEAM_EMOJI_NAMES
    .map((emojiName) => findEmojiByName(guild, emojiName))
    .filter(Boolean)
    .map((emoji) => emoji.toString());

  if (available.length === 0) {
    return { homeTeamDisplay: "🏠", awayTeamDisplay: "🛫" };
  }

  if (available.length === 1) {
    return { homeTeamDisplay: available[0], awayTeamDisplay: available[0] };
  }

  const homeIndex = Math.floor(Math.random() * available.length);
  let awayIndex = Math.floor(Math.random() * available.length);
  while (awayIndex === homeIndex) {
    awayIndex = Math.floor(Math.random() * available.length);
  }

  return {
    homeTeamDisplay: available[homeIndex],
    awayTeamDisplay: available[awayIndex]
  };
}

function resolveFaceDownCardDisplay(guild) {
  if (!guild) {
    return FACE_DOWN_CARD_FALLBACK;
  }

  const customBack = findEmojiByName(guild, "download");
  if (customBack) {
    return customBack.toString();
  }

  return FACE_DOWN_CARD_FALLBACK;
}

function buildBetRow(sessionId, round) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`fb:${sessionId}:${round}:home`)
      .setLabel("Home")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`fb:${sessionId}:${round}:away`)
      .setLabel("Away")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`fb:${sessionId}:${round}:draw`)
      .setLabel("Draw")
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildDisabledRow(sessionId, round) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`fb:${sessionId}:${round}:home`)
      .setLabel("Home")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`fb:${sessionId}:${round}:away`)
      .setLabel("Away")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`fb:${sessionId}:${round}:draw`)
      .setLabel("Draw")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );
}

function getPickLabel(pick) {
  if (pick === "home") return "Home Win";
  if (pick === "away") return "Away Win";
  return "Draw";
}

function getSpinFrame(index) {
  return SPIN_FRAMES[index % SPIN_FRAMES.length];
}

function buildFaceDownBoard(matchup, faceDownCardDisplay) {
  return [
    `${matchup.homeTeamDisplay} ${faceDownCardDisplay}`,
    `${matchup.awayTeamDisplay} ${faceDownCardDisplay}`
  ].join("\n");
}

function buildCardBoard(matchup, homeCardDisplay, awayCardDisplay) {
  return [
    `${matchup.homeTeamDisplay} ${homeCardDisplay}`,
    `${matchup.awayTeamDisplay} ${awayCardDisplay}`
  ].join("\n");
}

function buildRoundEmbed(round, secondsLeft, frame, matchup) {
  return buildEmbed({
    title: "Football Studio ⚽",
    description: [
      `Round: **${round}**`,
      `Còn lại: **${secondsLeft}s** ${frame}`,
      "Đặt cược trong 30 giây.",
      "Home/Away: 1 ăn 1 (x2). Draw: x11.",
      "Nếu ra Draw mà không cược Draw: mất nửa tiền."
    ].join("\n"),
    color: 0xf6c244
  });
}

function buildRevealEmbed(round, frame, matchup) {
  return buildEmbed({
    title: "Football Studio ⚽",
    description: [
      `Round: **${round}**`,
      `Đang chia bài... ${frame}`
    ].join("\n"),
    color: 0xf6c244
  });
}

async function playRoundAnimated(message, round, guild, matchup, faceDownCardDisplay) {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const homeCard = drawCard();
  const homeDisplay = formatCardDisplay(homeCard, guild);

  await message.edit({
    content: buildCardBoard(matchup, homeDisplay, faceDownCardDisplay),
    embeds: [
      buildEmbed({
        title: "Football Studio ⚽",
        description: `Round: **${round}**`,
        color: 0xf6c244
      })
    ],
    components: []
  }).catch(() => null);

  await delay(CARD_REVEAL_DELAY_MS);

  const awayCard = drawCard();
  const awayDisplay = formatCardDisplay(awayCard, guild);

  await message.edit({
    content: buildCardBoard(matchup, homeDisplay, awayDisplay),
    embeds: [
      buildEmbed({
        title: "Football Studio ⚽",
        description: `Round: **${round}**`,
        color: 0xf6c244
      })
    ],
    components: []
  }).catch(() => null);

  await delay(CARD_REVEAL_DELAY_MS);

  return { homeCard, awayCard, homeDisplay, awayDisplay };
}

async function settleBets(bets, result) {
  let totalPayout = 0;
  let winners = 0;
  let refunds = 0;

  for (const bet of bets) {
    const user = await getOrCreateUser(bet.userId, bet.userName);
    let payout = 0;
    if (result === "draw") {
      if (bet.pick === "draw") {
        payout = bet.amount * DRAW_PAYOUT_MULTIPLIER;
        winners += 1;
      } else {
        payout = Math.floor(bet.amount / 2);
        if (payout > 0) {
          refunds += 1;
        }
      }
    } else if (bet.pick === result) {
      payout = bet.amount * HOME_PAYOUT_MULTIPLIER;
      winners += 1;
    }

    if (payout > 0) {
      user.balance += payout;
      totalPayout += payout;
      await user.save();
    }
  }

  return { totalPayout, winners, refunds };
}

async function runSession(channel, session) {
  while (session.running) {
    session.round += 1;

    const round = session.round;
    const bets = [];
    const endTime = Date.now() + BET_WINDOW_MS;
    let frameIndex = 0;
    const matchup = getRandomTeamMatchup(session.guild);
    const faceDownCardDisplay = resolveFaceDownCardDisplay(session.guild);
    const embed = buildRoundEmbed(
      round,
      Math.ceil(BET_WINDOW_MS / 1000),
      getSpinFrame(frameIndex),
      matchup
    );

    const message = await channel.send({
      content: buildFaceDownBoard(matchup, faceDownCardDisplay),
      embeds: [embed],
      components: [buildBetRow(session.id, round)]
    });

    const countdownInterval = setInterval(() => {
      const secondsLeft = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      frameIndex += 1;
      const updated = buildRoundEmbed(round, secondsLeft, getSpinFrame(frameIndex), matchup);
      message.edit({
        content: buildFaceDownBoard(matchup, faceDownCardDisplay),
        embeds: [updated]
      }).catch(() => null);

      if (secondsLeft <= 0) {
        clearInterval(countdownInterval);
      }
    }, 1000);

    const collector = message.createMessageComponentCollector({
      time: BET_WINDOW_MS
    });

    collector.on("collect", async (btn) => {
      const [prefix, sessionId, roundId, pick] = btn.customId.split(":");
      if (prefix !== "fb" || sessionId !== session.id || Number(roundId) !== round) {
        await btn.reply({ content: "Phiên cược này đã hết hạn.", ephemeral: true });
        return;
      }

      const modalId = `fbm:${sessionId}:${round}:${btn.user.id}:${pick}:${btn.id}`;
      const modal = new ModalBuilder()
        .setCustomId(modalId)
        .setTitle("Đặt cược Football");

      const amountInput = new TextInputBuilder()
        .setCustomId("amount")
        .setLabel("Số điểm")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(amountInput));

      await btn.showModal(modal);

      let submitted;
      try {
        submitted = await btn.awaitModalSubmit({
          time: BET_WINDOW_MS,
          filter: (i) => i.customId === modalId && i.user.id === btn.user.id
        });
      } catch (err) {
        return;
      }

      try {
        await submitted.deferReply({ ephemeral: true });
      } catch (error) {
        if (error?.code === 40060) {
          return;
        }
        throw error;
      }

      const amount = normalizeAmount(submitted.fields.getTextInputValue("amount").trim());
      if (!amount) {
        await submitted.editReply({ content: "Số điểm không hợp lệ." });
        return;
      }

      if (collector.ended) {
        await submitted.editReply({ content: "Phiên cược đã kết thúc." });
        return;
      }

      const userName = submitted.user.globalName || submitted.user.username;
      const user = await getOrCreateUser(submitted.user.id, userName);
      if (user.balance < amount) {
        await submitted.editReply({
          content: `Không đủ số dư. Hiện tại: ${formatPoints(user.balance)}.`
        });
        return;
      }

      user.balance -= amount;
      await user.save();

      bets.push({
        userId: submitted.user.id,
        userName,
        pick,
        amount
      });

      await submitted.editReply({
        content: `Đã đặt cược **${formatPoints(amount)}** vào **${getPickLabel(pick)}**.`
      });
    });

    collector.on("end", async () => {
      clearInterval(countdownInterval);
      await message.edit({
        content: buildFaceDownBoard(matchup, faceDownCardDisplay),
        embeds: [buildRoundEmbed(round, 0, getSpinFrame(frameIndex), matchup)],
        components: [buildDisabledRow(session.id, round)]
      });
    });

    await new Promise((resolve) => setTimeout(resolve, BET_WINDOW_MS));

    const noPlayers = bets.length === 0;
    if (noPlayers) {
      session.idleRounds += 1;
    } else {
      session.idleRounds = 0;
    }

    for (let tick = 0; tick < REVEAL_TICKS; tick += 1) {
      const revealEmbed = buildRevealEmbed(round, getSpinFrame(tick), matchup);
      await message.edit({
        content: buildFaceDownBoard(matchup, faceDownCardDisplay),
        embeds: [revealEmbed],
        components: [buildDisabledRow(session.id, round)]
      });
      await new Promise((resolve) => setTimeout(resolve, REVEAL_TICK_MS));
    }

    const { homeCard, awayCard, homeDisplay, awayDisplay } = await playRoundAnimated(
      message,
      round,
      session.guild,
      matchup,
      faceDownCardDisplay
    );
    const result = homeCard.value > awayCard.value
      ? "home"
      : awayCard.value > homeCard.value
        ? "away"
        : "draw";

    const settlement = await settleBets(bets, result);
    const jumboBoard = buildJumboFootballBoard(matchup.homeTeamDisplay, matchup.awayTeamDisplay);
    const resultEmbed = buildEmbed({
      title: "Kết quả Football Studio 🏁",
      description: [
        `Trận đấu: ${matchup.homeTeamDisplay} vs ${matchup.awayTeamDisplay}`,
        `Home: **${homeDisplay}**`,
        `Away: **${awayDisplay}**`,
        `Kết quả: **${getPickLabel(result)}**`,
        `Số lượt cược: **${bets.length}**`,
        `Thắng: **${settlement.winners}** | Hoàn nửa: **${settlement.refunds}**`,
        `Tổng trả thưởng: **${formatPoints(settlement.totalPayout)}**`
      ].join("\n"),
      color: result === "draw" ? 0xf6c244 : 0x6ae4c5
    });

    await channel.send(jumboBoard
      ? { content: jumboBoard, embeds: [resultEmbed] }
      : { embeds: [resultEmbed] });

    if (noPlayers && session.idleRounds >= MAX_IDLE_ROUNDS) {
      session.running = false;
      break;
    }
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("fb")
    .setDescription("Football Studio - dat cuoc Home/Away/Draw"),
  async execute(interaction) {
    if (!interaction.channel) {
      return interaction.reply({ content: "Lệnh này chỉ dùng trong server.", ephemeral: true });
    }

    const channelId = interaction.channelId;
    const lockedBy = acquireChannelGameLock(channelId, "Football Studio");
    if (lockedBy) {
      return interaction.reply({
        content: `${lockedBy} đang chạy ở kênh này. Hãy chờ phiên kết thúc rồi thử lại.`,
        ephemeral: true
      });
    }

    try {
      const session = {
        id: String(++sessionCounter),
        channelId,
        guild: interaction.guild,
        round: 0,
        idleRounds: 0,
        running: true
      };

      await primeEmojiCaches(interaction.guild);
      sessions.set(channelId, session);

      await interaction.reply({
        content: "Đã bắt đầu Football Studio. Mọi người đặt cược!",
        ephemeral: true
      });

      await runSession(interaction.channel, session);
    } finally {
      sessions.delete(channelId);
      releaseChannelGameLock(channelId);
    }
  }
};
