const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const { buildEmbed, getOrCreateUser, normalizeAmount } = require("./utils");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("give")
    .setDescription("Chuyển điểm cho người khác")
    .addUserOption((opt) =>
      opt.setName("nguoinhan").setDescription("Người nhận").setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName("sotien").setDescription("Số điểm cần chuyển").setRequired(true)
    ),
  async execute(interaction) {
    const receiver = interaction.options.getUser("nguoinhan", true);
    const amount = normalizeAmount(interaction.options.getInteger("sotien", true));

    if (!amount) {
      const embed = buildEmbed({
        title: "Số tiền không hợp lệ",
        description: "Vui lòng nhập số dương. \ud83d\udcb8",
        color: 0xf36c5c
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (receiver.id === interaction.user.id) {
      const embed = buildEmbed({
        title: "Không thể tự chuyển",
        description: "Bạn không thể tự chuyển điểm cho chính mình.",
        color: 0xf36c5c
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const senderName = interaction.user.globalName || interaction.user.username;
    const receiverName = receiver.globalName || receiver.username;

    const requestEmbed = buildEmbed({
      title: "Yêu cầu chuyển điểm \ud83d\udce8",
      description: [
        `Từ: **${senderName}**`, 
        `Đến: **${receiverName}**`, 
        `Số tiền: **${amount}** \ud83d\udcb0`, 
        "Người gửi vui lòng xác nhận."
      ].join("\n"),
      color: 0xf6c244
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`give_confirm:${interaction.user.id}:${receiver.id}:${amount}`)
        .setLabel("Xác nhận")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`give_deny:${interaction.user.id}:${receiver.id}:${amount}`)
        .setLabel("Từ chối")
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({ embeds: [requestEmbed], components: [row] });

    const message = await interaction.fetchReply();
    const collector = message.createMessageComponentCollector({
      time: 60_000
    });

    collector.on("collect", async (btn) => {
      const [action, senderId, receiverId, rawAmount] = btn.customId.split(":");
      if (senderId !== btn.user.id) {
        await btn.reply({ content: "Bạn không phải người gửi.", ephemeral: true });
        return;
      }

      if (senderId !== interaction.user.id || receiverId !== receiver.id) {
        await btn.reply({ content: "Yêu cầu không hợp lệ.", ephemeral: true });
        return;
      }

      const parsedAmount = Number(rawAmount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        await btn.reply({ content: "Số tiền không hợp lệ.", ephemeral: true });
        return;
      }

      if (action === "give_deny") {
        collector.stop("denied");
        await btn.update({
          embeds: [buildEmbed({
            title: "Từ chối chuyển điểm \u274c",
            description: `${senderName} đã hủy yêu cầu chuyển điểm.`,
            color: 0xf36c5c
          })],
          components: []
        });
        return;
      }

      const sender = await getOrCreateUser(senderId, senderName);
      if (sender.balance < parsedAmount) {
        collector.stop("insufficient");
        await btn.update({
          embeds: [buildEmbed({
            title: "Không đủ số dư \u26a0\ufe0f",
            description: "Người gửi không đủ số dư để chuyển.",
            color: 0xf36c5c
          })],
          components: []
        });
        return;
      }

      const recipient = await getOrCreateUser(receiverId, receiverName);
      sender.balance -= parsedAmount;
      recipient.balance += parsedAmount;
      await sender.save();
      await recipient.save();

      collector.stop("confirmed");
      await btn.update({
        embeds: [buildEmbed({
          title: "Chuyển điểm thành công \ud83e\udd1d",
          description: [
            `Từ: **${senderName}**`,
            `Đến: **${receiverName}**`,
            `Số tiền: **${parsedAmount}** \ud83d\udcb0`
          ].join("\n"),
          color: 0x6ae4c5
        })],
        components: []
      });
    });

    collector.on("end", async (collected, reason) => {
      if (reason !== "time") {
        return;
      }
      await message.edit({
        embeds: [buildEmbed({
          title: "Hết hạn xác nhận \u23f3",
          description: "Yêu cầu chuyển điểm đã hết hạn.",
          color: 0x9aa4c7
        })],
        components: []
      });
    });
  }
};
