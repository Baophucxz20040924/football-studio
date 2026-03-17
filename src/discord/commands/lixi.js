const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require("discord.js");
const { buildEmbed, getOrCreateUser, normalizeAmount, formatPoints } = require("./utils");

const LIXI_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_RECIPIENTS_LIMIT = 50;
const sessions = new Map();

function buildSessionId(interaction) {
  return `${interaction.id}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}

function pickRandomAmount(remainingAmount, remainingSlots) {
  if (remainingSlots <= 1) {
    return remainingAmount;
  }

  const maxAllowed = remainingAmount - (remainingSlots - 1);
  const softCap = Math.max(1, Math.floor((remainingAmount * 2) / remainingSlots));
  const upperBound = Math.max(1, Math.min(maxAllowed, softCap));
  return Math.floor(Math.random() * upperBound) + 1;
}

function pickEqualAmount(remainingAmount, remainingSlots) {
  if (remainingSlots <= 1) {
    return remainingAmount;
  }

  return Math.floor(remainingAmount / remainingSlots);
}

function buildLixiEmbed(session, statusLine) {
  const claimedLines = session.claims.length > 0
    ? session.claims.map((claim, index) => `${index + 1}. <@${claim.userId}>: **${formatPoints(claim.amount)}**`).join("\n")
    : "Chưa có ai húp lì xì.";

  return buildEmbed({
    title: "Lì xì may mắn 🧧",
    description: [
      `Chủ bao: <@${session.ownerId}>`,
      `Kiểu chia: **${session.mode === "random" ? "Random" : "Chia đều"}**`,
      `Tổng tiền: **${formatPoints(session.totalAmount)}**`,
      `Đã nhận: **${session.claims.length}/${session.maxRecipients}** người`,
      `Còn lại: **${formatPoints(session.remainingAmount)}**`,
      statusLine
    ].join("\n"),
    color: 0xf04444
  }).addFields({
    name: "Danh sách đã húp",
    value: claimedLines
  });
}

async function disableLixiMessage(message, session, statusLine) {
  await message.edit({
    embeds: [buildLixiEmbed(session, statusLine)],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`lixi_claim:${session.id}`)
          .setLabel("HÚP")
          .setStyle(ButtonStyle.Success)
          .setDisabled(true)
      )
    ]
  }).catch(() => null);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("lixi")
    .setDescription("Tạo bao lì xì để mọi người bấm HÚP")
    .addIntegerOption((opt) =>
      opt
        .setName("songuoihan")
        .setDescription("Số người nhận tối đa")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(MAX_RECIPIENTS_LIMIT)
    )
    .addStringOption((opt) =>
      opt
        .setName("sotien")
        .setDescription("Tổng tiền lì xì (vd: 20k, 1m, 1m2)")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("kieuchia")
        .setDescription("Kiểu chia tiền")
        .setRequired(true)
        .addChoices(
          { name: "Random", value: "random" },
          { name: "Chia đều", value: "equal" }
        )
    ),
  async execute(interaction) {
    const maxRecipients = interaction.options.getInteger("songuoihan", true);
    const rawAmount = interaction.options.getString("sotien", true);
    const mode = interaction.options.getString("kieuchia", true);
    const amount = normalizeAmount(rawAmount);

    if (!amount || amount <= 0) {
      return interaction.reply({
        embeds: [buildEmbed({
          title: "Số tiền không hợp lệ ❌",
          description: "Nhập số dương, ví dụ: 20k, 1m2, 2.5m.",
          color: 0xf36c5c
        })],
        flags: MessageFlags.Ephemeral
      });
    }

    if (amount < maxRecipients) {
      return interaction.reply({
        embeds: [buildEmbed({
          title: "Không đủ để chia 🎁",
          description: `Tổng tiền phải >= số người nhận. Hiện tại: **${formatPoints(amount)}** cho **${maxRecipients}** người.`,
          color: 0xf36c5c
        })],
        flags: MessageFlags.Ephemeral
      });
    }

    const ownerName = interaction.user.globalName || interaction.user.username;
    const owner = await getOrCreateUser(interaction.user.id, ownerName);
    if (owner.balance < amount) {
      return interaction.reply({
        embeds: [buildEmbed({
          title: "Không đủ số dư ⚠️",
          description: [
            `Bạn có: **${formatPoints(owner.balance)}**`,
            `Cần: **${formatPoints(amount)}**`
          ].join("\n"),
          color: 0xf36c5c
        })],
        flags: MessageFlags.Ephemeral
      });
    }

    owner.balance -= amount;
    await owner.save();

    const session = {
      id: buildSessionId(interaction),
      ownerId: interaction.user.id,
      mode,
      maxRecipients,
      totalAmount: amount,
      remainingAmount: amount,
      claims: [],
      claimUserIds: new Set(),
      lock: false
    };
    sessions.set(session.id, session);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`lixi_claim:${session.id}`)
        .setLabel("HÚP")
        .setStyle(ButtonStyle.Success)
    );

    await interaction.reply({
      embeds: [buildLixiEmbed(session, "Nhấn nút **HÚP** để nhận lì xì.")],
      components: [row]
    });

    const message = await interaction.fetchReply();
    const collector = message.createMessageComponentCollector({
      time: LIXI_TIMEOUT_MS
    });

    collector.on("collect", async (btn) => {
      if (btn.customId !== `lixi_claim:${session.id}`) {
        return;
      }

      if (session.lock) {
        await btn.reply({ content: "Đang xử lý lượt trước, chờ chút nha.", flags: MessageFlags.Ephemeral });
        return;
      }

      session.lock = true;
      try {
        if (btn.user.id === session.ownerId) {
          await btn.reply({ content: "Bạn là chủ bao nên không thể tự húp.", flags: MessageFlags.Ephemeral });
          return;
        }

        if (session.claimUserIds.has(btn.user.id)) {
          await btn.reply({ content: "Bạn đã húp rồi, nhường người khác nha.", flags: MessageFlags.Ephemeral });
          return;
        }

        const remainingSlots = session.maxRecipients - session.claims.length;
        if (remainingSlots <= 0 || session.remainingAmount <= 0) {
          await btn.reply({ content: "Bao lì xì đã hết rồi.", flags: MessageFlags.Ephemeral });
          return;
        }

        const claimAmount = session.mode === "random"
          ? pickRandomAmount(session.remainingAmount, remainingSlots)
          : pickEqualAmount(session.remainingAmount, remainingSlots);

        if (!Number.isFinite(claimAmount) || claimAmount <= 0 || claimAmount > session.remainingAmount) {
          await btn.reply({ content: "Không thể nhận lì xì lúc này, thử lại sau.", flags: MessageFlags.Ephemeral });
          return;
        }

        const claimerName = btn.user.globalName || btn.user.username;
        const claimer = await getOrCreateUser(btn.user.id, claimerName);
        claimer.balance += claimAmount;
        await claimer.save();

        session.remainingAmount -= claimAmount;
        session.claims.push({ userId: btn.user.id, amount: claimAmount });
        session.claimUserIds.add(btn.user.id);

        const finished = session.claims.length >= session.maxRecipients || session.remainingAmount <= 0;
        const statusLine = finished
          ? "Bao lì xì đã được húp hết."
          : "Nhấn nút **HÚP** để nhận lì xì.";

        await btn.update({
          embeds: [buildLixiEmbed(session, statusLine)],
          components: finished ? [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`lixi_claim:${session.id}`)
                .setLabel("HÚP")
                .setStyle(ButtonStyle.Success)
                .setDisabled(true)
            )
          ] : [row]
        });

        if (finished) {
          collector.stop("completed");
        }
      } finally {
        session.lock = false;
      }
    });

    collector.on("end", async (_collected, reason) => {
      const latest = sessions.get(session.id);
      if (!latest) {
        return;
      }

      if (latest.remainingAmount > 0) {
        const ownerUser = await getOrCreateUser(latest.ownerId, ownerName);
        ownerUser.balance += latest.remainingAmount;
        await ownerUser.save();
        latest.remainingAmount = 0;
      }

      const reasonLine = reason === "completed"
        ? "Bao lì xì đã được húp hết."
        : "Hết thời gian nhận lì xì. Tiền dư đã hoàn về chủ bao.";

      await disableLixiMessage(message, latest, reasonLine);
      sessions.delete(session.id);
    });
  }
};