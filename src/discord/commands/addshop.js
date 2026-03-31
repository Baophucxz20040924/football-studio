const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const ShopItem = require("../../models/ShopItem");
const { buildEmbed, normalizeAmount, formatPoints } = require("./utils");

const ADMIN_BOT_ID = "386863309691027458";

function toItemKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function toStatusLabel(status) {
  if (status === "soldout") {
    return "HẾT HÀNG";
  }
  if (status === "hidden") {
    return "ẨN DANH";
  }
  return "ĐANG MỞ";
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("addshop")
    .setDescription("Quản lý mặt hàng trong chợ đen (admin)")
    .addSubcommand((sub) => (
      sub
        .setName("set")
        .setDescription("Thêm mới hoặc cập nhật item")
        .addStringOption((opt) => (
          opt
            .setName("item")
            .setDescription("Tên item")
            .setRequired(true)
        ))
        .addStringOption((opt) => (
          opt
            .setName("price")
            .setDescription("Giá (vd: 10000, 20k, 1m2)")
            .setRequired(true)
        ))
        .addStringOption((opt) => (
          opt
            .setName("status")
            .setDescription("Trạng thái hiển thị")
            .addChoices(
              { name: "ĐANG MỞ", value: "available" },
              { name: "HẾT HÀNG", value: "soldout" },
              { name: "ẨN DANH", value: "hidden" }
            )
            .setRequired(false)
        ))
    ))
    .addSubcommand((sub) => (
      sub
        .setName("remove")
        .setDescription("Xóa item khỏi shop")
        .addStringOption((opt) => (
          opt
            .setName("item")
            .setDescription("Tên item")
            .setRequired(true)
        ))
    )),

  async execute(interaction) {
    if (interaction.user.id !== ADMIN_BOT_ID) {
      return interaction.reply({
        content: "Bạn không có quyền dùng lệnh này.",
        flags: MessageFlags.Ephemeral
      });
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "remove") {
      const itemName = interaction.options.getString("item", true).trim();
      const key = toItemKey(itemName);
      const removed = await ShopItem.findOneAndDelete({ key });

      if (!removed) {
        return interaction.reply({
          content: "Không tìm thấy item để xóa.",
          flags: MessageFlags.Ephemeral
        });
      }

      const embed = buildEmbed({
        title: "Chợ đen đã cập nhật",
        description: [
          "Đã gỡ một mặt hàng khỏi chợ đen:",
          `Item: **${removed.item}**`
        ].join("\n"),
        color: 0xf36c5c
      });

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    const itemName = interaction.options.getString("item", true).trim();
    const rawPrice = interaction.options.getString("price", true);
    const status = interaction.options.getString("status") || "available";
    const price = normalizeAmount(rawPrice);

    if (!price || price < 0) {
      return interaction.reply({
        content: "Giá không hợp lệ. Ví dụ: 10000, 20k, 1m2.",
        flags: MessageFlags.Ephemeral
      });
    }

    const key = toItemKey(itemName);
    const updatedByName = interaction.user.globalName || interaction.user.username;

    const saved = await ShopItem.findOneAndUpdate(
      { key },
      {
        $set: {
          key,
          item: itemName,
          price,
          status,
          updatedBy: interaction.user.id,
          updatedByName
        }
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true
      }
    );

    const embed = buildEmbed({
      title: "Chợ đen đã cập nhật",
      description: [
        `Item: **${saved.item}**`,
        `Price: **${formatPoints(saved.price)}**`,
        `Status: **${toStatusLabel(saved.status)}**`
      ].join("\n"),
      color: 0x7b3fe4
    });

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
};
