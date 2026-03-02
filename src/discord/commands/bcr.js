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
const PLAYER_PAYOUT_MULTIPLIER = 2;
const BANKER_PAYOUT_MULTIPLIER = 1.95;
const TIE_PAYOUT_MULTIPLIER = 10;
const SPIN_FRAMES = ["🎴🔄", "🎴✨"];
const REVEAL_TICK_MS = 700;
const REVEAL_TICKS = 4;
const CARD_BACK_EMOJI_NAME = "download";
const CARD_BACK_EMOJI_FALLBACK = "🎴";
const THIRD_CARD_REVEAL_DELAY_MS = 1_500;

const CARD_VALUES = new Map([
  ["A", 1],
  ["2", 2],
  ["3", 3],
  ["4", 4],
  ["5", 5],
  ["6", 6],
  ["7", 7],
  ["8", 8],
  ["9", 9],
  ["10", 0],
  ["J", 0],
  ["Q", 0],
  ["K", 0]
]);
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
const CARD_LABELS = Array.from(CARD_VALUES.keys());
const CARD_SUITS = Object.keys(CARD_SUIT_EMOJIS);

const sessions = new Map();
let sessionCounter = 0;

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

function resolveCardBackEmoji(guild) {
  if (!guild) {
    return CARD_BACK_EMOJI_FALLBACK;
  }

  const emoji = findEmojiByName(guild, CARD_BACK_EMOJI_NAME);
  return emoji ? emoji.toString() : CARD_BACK_EMOJI_FALLBACK;
}

function drawCard(guild) {
  const rankIndex = Math.floor(Math.random() * CARD_LABELS.length);
  const suitIndex = Math.floor(Math.random() * CARD_SUITS.length);
  const label = CARD_LABELS[rankIndex];
  const suit = CARD_SUITS[suitIndex];
  const customEmoji = resolveCustomCardEmoji(guild, label, suit);
  const fallbackSuitEmoji = CARD_SUIT_EMOJIS[suit] || "";
  const display = customEmoji || `${label}${fallbackSuitEmoji}`;
  return { label, value: CARD_VALUES.get(label), emoji: customEmoji || fallbackSuitEmoji, display };
}

function totalPoints(cards) {
  const sum = cards.reduce((acc, card) => acc + card.value, 0);
  return sum % 10;
}

function getSpinFrame(index) {
  return SPIN_FRAMES[index % SPIN_FRAMES.length];
}

function buildBetRow(sessionId, round) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`bcr:${sessionId}:${round}:player`)
      .setLabel("Player")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`bcr:${sessionId}:${round}:banker`)
      .setLabel("Banker")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`bcr:${sessionId}:${round}:tie`)
      .setLabel("Tie")
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildDisabledRow(sessionId, round) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`bcr:${sessionId}:${round}:player`)
      .setLabel("Player")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`bcr:${sessionId}:${round}:banker`)
      .setLabel("Banker")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`bcr:${sessionId}:${round}:tie`)
      .setLabel("Tie")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );
}

function getPickLabel(pick) {
  if (pick === "player") return "Player";
  if (pick === "banker") return "Banker";
  return "Tie";
}

function buildRoundEmbed(round, secondsLeft, frame) {
  return buildEmbed({
    title: "Baccarat 🎴",
    description: [
      `Round: **${round}**`,
      `Còn lại: **${secondsLeft}s** ${frame}`,
      "Đặt cược trong 30 giây.",
      "Player: 1:1 | Banker: 1:0.95 | Tie: 1:9"
    ].join("\n"),
    color: 0xf6c244
  });
}

function buildRevealEmbed(round, frame) {
  return buildEmbed({
    title: "Baccarat 🎴",
    description: [`Round: **${round}**`, `Đang chia bài... ${frame}`].join("\n"),
    color: 0xf6c244
  });
}

function buildResultEmbed(round, playerCards, bankerCards, result, settlement) {
  const playerTotal = totalPoints(playerCards);
  const bankerTotal = totalPoints(bankerCards);
  const playerLabel = playerCards.map((card) => card.display).join(" ");
  const bankerLabel = bankerCards.map((card) => card.display).join(" ");

  return buildEmbed({
    title: "Kết quả Baccarat 🏆",
    description: [
      `Round: **${round}**`,
      `Player: **${playerLabel}** (=${playerTotal})`,
      `Banker: **${bankerLabel}** (=${bankerTotal})`,
      `Kết quả: **${getPickLabel(result)}**`,
      `Số lượt cược: **${settlement.betCount}**`,
      `Thắng: **${settlement.winners}**`,
      `Tổng trả thưởng: **${formatPoints(settlement.totalPayout)}**`
    ].join("\n"),
    color: result === "tie" ? 0xf6c244 : 0x6ae4c5
  });
}

function isCustomEmoji(value) {
  return /^<a?:\w+:\d+>$/.test(value);
}

function buildBaccaratBoard(playerCards, bankerCards) {
  const playerLine = ["🟦", ...playerCards].join(" ");
  const bankerLine = ["🟥", ...bankerCards].join(" ");
  return [playerLine, bankerLine].join("\n");
}

function buildJumboCardBoard(playerCards, bankerCards) {
  const allCards = [...playerCards, ...bankerCards];
  if (allCards.length === 0 || allCards.some((card) => !isCustomEmoji(card.emoji))) {
    return null;
  }

  const playerLine = ["🟦", ...playerCards.map((card) => card.emoji)].join(" ");
  const bankerLine = ["🟥", ...bankerCards.map((card) => card.emoji)].join(" ");
  return [playerLine, bankerLine].join("\n");
}

function shouldPlayerDraw(total) {
  return total <= 5;
}

function shouldBankerDraw(total, playerThirdValue, playerDrew) {
  if (!playerDrew) {
    return total <= 5;
  }

  if (total <= 2) return true;
  if (total === 3) return playerThirdValue !== 8;
  if (total === 4) return playerThirdValue >= 2 && playerThirdValue <= 7;
  if (total === 5) return playerThirdValue >= 4 && playerThirdValue <= 7;
  if (total === 6) return playerThirdValue >= 6 && playerThirdValue <= 7;
  return false;
}

async function settleBets(bets, result) {
  let totalPayout = 0;
  let winners = 0;

  for (const bet of bets) {
    const user = await getOrCreateUser(bet.userId, bet.userName);
    let payout = 0;
    if (result === "player" && bet.pick === "player") {
      payout = Math.round(bet.amount * PLAYER_PAYOUT_MULTIPLIER);
    } else if (result === "banker" && bet.pick === "banker") {
      payout = Math.round(bet.amount * BANKER_PAYOUT_MULTIPLIER);
    } else if (result === "tie" && bet.pick === "tie") {
      payout = Math.round(bet.amount * TIE_PAYOUT_MULTIPLIER);
    }

    if (payout > 0) {
      winners += 1;
      totalPayout += payout;
      user.balance += payout;
      await user.save();
    }
  }

  return { totalPayout, winners, betCount: bets.length };
}

async function playRoundAnimated(message, sessionId, round, guild) {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const CARD_DELAY = 2000;
  const cardBackEmoji = resolveCardBackEmoji(guild);

  const faceDownCards = (count) => Array.from({ length: count }, () => cardBackEmoji);
  const formatMixedCards = (cards, revealedCount) => cards
    .map((card, index) => (index < revealedCount ? card.display : cardBackEmoji));
  const formatThirdCardFaceDown = (cards) => cards
    .map((card, index) => (index === cards.length - 1 ? cardBackEmoji : card.display));

  const playerCards = [drawCard(guild), drawCard(guild)];
  const bankerCards = [drawCard(guild), drawCard(guild)];

  let embed = buildEmbed({
    title: "Baccarat 🎴",
    description: `Round: **${round}**`,
    color: 0xf6c244
  });
  await message.edit({
    content: buildBaccaratBoard(faceDownCards(2), faceDownCards(2)),
    embeds: [embed]
  }).catch(() => null);
  await delay(CARD_DELAY);

  let playerRevealed = 0;
  let bankerRevealed = 0;
  const revealOrder = ["player", "banker", "player", "banker"];
  for (const target of revealOrder) {
    if (target === "player") {
      playerRevealed += 1;
    } else {
      bankerRevealed += 1;
    }

    embed = buildEmbed({
      title: "Baccarat 🎴",
      description: `Round: **${round}**`,
      color: 0xf6c244
    });
    await message.edit({
      content: buildBaccaratBoard(
        formatMixedCards(playerCards, playerRevealed),
        formatMixedCards(bankerCards, bankerRevealed)
      ),
      embeds: [embed]
    }).catch(() => null);
    await delay(CARD_DELAY);
  }

  let playerTotal = totalPoints(playerCards);
  let bankerTotal = totalPoints(bankerCards);
  let playerLabel = playerCards.map((c) => c.display).join(" ");
  let bankerLabel = bankerCards.map((c) => c.display).join(" ");

  embed = buildEmbed({
    title: "Baccarat 🎴",
    description: [
      `Round: **${round}**`,
      `Player: (=${playerTotal})`,
      `Banker: (=${bankerTotal})`
    ].join("\n"),
    color: 0xf6c244
  });
  await message.edit({
    content: buildBaccaratBoard(
      playerCards.map((c) => c.display),
      bankerCards.map((c) => c.display)
    ),
    embeds: [embed]
  }).catch(() => null);
  await delay(CARD_DELAY);

  const natural = playerTotal >= 8 || bankerTotal >= 8;
  let playerThird = null;

  // Check player draw
  if (!natural && shouldPlayerDraw(playerTotal)) {
    playerThird = drawCard(guild);
    playerCards.push(playerThird);

    embed = buildEmbed({
      title: "Baccarat 🎴",
      description: [
        `Round: **${round}**`,
        "Player rút lá 3 (úp)",
        `Banker: (=${bankerTotal})`
      ].join("\n"),
      color: 0xf6c244
    });
    await message.edit({
      content: buildBaccaratBoard(
        formatThirdCardFaceDown(playerCards),
        bankerCards.map((c) => c.display)
      ),
      embeds: [embed]
    }).catch(() => null);
    await delay(THIRD_CARD_REVEAL_DELAY_MS);

    playerTotal = totalPoints(playerCards);
    playerLabel = playerCards.map((c) => c.display).join(" ");
    embed = buildEmbed({
      title: "Baccarat 🎴",
      description: [
        `Round: **${round}**`,
        `Player rút lá 3: (=${playerTotal})`,
        `Banker: (=${bankerTotal})`
      ].join("\n"),
      color: 0xf6c244
    });
    await message.edit({
      content: buildBaccaratBoard(
        playerCards.map((c) => c.display),
        bankerCards.map((c) => c.display)
      ),
      embeds: [embed]
    }).catch(() => null);
    await delay(CARD_DELAY);
  }

  // Check banker draw
  if (!natural && shouldBankerDraw(bankerTotal, playerThird?.value, Boolean(playerThird))) {
    bankerCards.push(drawCard(guild));

    embed = buildEmbed({
      title: "Baccarat 🎴",
      description: [
        `Round: **${round}**`,
        `Player: (=${playerTotal})`,
        "Banker rút lá 3 (úp)"
      ].join("\n"),
      color: 0xf6c244
    });
    await message.edit({
      content: buildBaccaratBoard(
        playerCards.map((c) => c.display),
        formatThirdCardFaceDown(bankerCards)
      ),
      embeds: [embed]
    }).catch(() => null);
    await delay(THIRD_CARD_REVEAL_DELAY_MS);

    bankerTotal = totalPoints(bankerCards);
    bankerLabel = bankerCards.map((c) => c.display).join(" ");
    embed = buildEmbed({
      title: "Baccarat 🎴",
      description: [
        `Round: **${round}**`,
        `Player: (=${playerTotal})`,
        `Banker rút lá 3: (=${bankerTotal})`
      ].join("\n"),
      color: 0xf6c244
    });
    await message.edit({
      content: buildBaccaratBoard(
        playerCards.map((c) => c.display),
        bankerCards.map((c) => c.display)
      ),
      embeds: [embed]
    }).catch(() => null);
    await delay(CARD_DELAY);
  }

  let result = "tie";
  if (playerTotal > bankerTotal) result = "player";
  if (bankerTotal > playerTotal) result = "banker";

  return { playerCards, bankerCards, result };
}

async function runSession(channel, session) {
  while (session.running) {
    session.round += 1;

    const round = session.round;
    const bets = [];
    const endTime = Date.now() + BET_WINDOW_MS;
    let frameIndex = 0;
    const embed = buildRoundEmbed(round, Math.ceil(BET_WINDOW_MS / 1000), getSpinFrame(frameIndex));

    const message = await channel.send({
      content: buildBaccaratBoard(
        [resolveCardBackEmoji(session.guild), resolveCardBackEmoji(session.guild)],
        [resolveCardBackEmoji(session.guild), resolveCardBackEmoji(session.guild)]
      ),
      embeds: [embed],
      components: [buildBetRow(session.id, round)]
    });

    const countdownInterval = setInterval(() => {
      const secondsLeft = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      frameIndex += 1;
      const updated = buildRoundEmbed(round, secondsLeft, getSpinFrame(frameIndex));
      const cardBackEmoji = resolveCardBackEmoji(session.guild);
      message.edit({
        content: buildBaccaratBoard([cardBackEmoji, cardBackEmoji], [cardBackEmoji, cardBackEmoji]),
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
      if (prefix !== "bcr" || sessionId !== session.id || Number(roundId) !== round) {
        await btn.reply({ content: "Phiên cược này đã hết hạn.", ephemeral: true });
        return;
      }

      const modalId = `bcrm:${sessionId}:${round}:${btn.user.id}:${pick}:${btn.id}`;
      const modal = new ModalBuilder()
        .setCustomId(modalId)
        .setTitle("Đặt cược Baccarat");

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
        content: buildBaccaratBoard(
          [resolveCardBackEmoji(session.guild), resolveCardBackEmoji(session.guild)],
          [resolveCardBackEmoji(session.guild), resolveCardBackEmoji(session.guild)]
        ),
        embeds: [buildRoundEmbed(round, 0, getSpinFrame(frameIndex))],
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
      const revealEmbed = buildRevealEmbed(round, getSpinFrame(tick));
      const cardBackEmoji = resolveCardBackEmoji(session.guild);
      await message.edit({
        content: buildBaccaratBoard([cardBackEmoji, cardBackEmoji], [cardBackEmoji, cardBackEmoji]),
        embeds: [revealEmbed],
        components: [buildDisabledRow(session.id, round)]
      });
      await new Promise((resolve) => setTimeout(resolve, REVEAL_TICK_MS));
    }

    const roundResult = await playRoundAnimated(message, session.id, round, session.guild);
    const settlement = await settleBets(bets, roundResult.result);
    const resultEmbed = buildResultEmbed(
      round,
      roundResult.playerCards,
      roundResult.bankerCards,
      roundResult.result,
      settlement
    );
    const jumboCardBoard = buildJumboCardBoard(roundResult.playerCards, roundResult.bankerCards);

    await channel.send(jumboCardBoard
      ? { content: jumboCardBoard, embeds: [resultEmbed] }
      : { embeds: [resultEmbed] });

    if (noPlayers && session.idleRounds >= MAX_IDLE_ROUNDS) {
      session.running = false;
      break;
    }
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("bcr")
    .setDescription("Baccarat - dat cuoc Player/Banker/Tie"),
  async execute(interaction) {
    if (!interaction.channel) {
      return interaction.reply({ content: "Lệnh này chỉ dùng trong server.", ephemeral: true });
    }

    const channelId = interaction.channelId;
    const lockedBy = acquireChannelGameLock(channelId, "Baccarat");
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
        content: "Đã bắt đầu Baccarat. Mọi người đặt cược!",
        ephemeral: true
      });

      await runSession(interaction.channel, session);
    } finally {
      sessions.delete(channelId);
      releaseChannelGameLock(channelId);
    }
  }
};
