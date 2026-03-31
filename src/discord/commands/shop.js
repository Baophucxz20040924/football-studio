const { SlashCommandBuilder } = require("discord.js");
const ShopItem = require("../../models/ShopItem");
const { buildEmbed, buildPagedEmbeds, formatPoints } = require("./utils");

const ITEM_COL_WIDTH = 26;
const PRICE_COL_WIDTH = 15;
const STATUS_COL_WIDTH = 10;
const ROWS_PER_PAGE = 25;

function truncateCell(value, maxLength) {
  const text = String(value || "").replace(/\|/g, "/").trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1))}~`;
}

function padCell(value, width) {
  const text = truncateCell(value, width);
  return text.padEnd(width, " ");
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

function buildTableHeader() {
  const header = [
    padCell("ITEM", ITEM_COL_WIDTH),
    padCell("PRICE", PRICE_COL_WIDTH),
    padCell("STATUS", STATUS_COL_WIDTH)
  ].join(" | ");

  return [
    header,
    `${"-".repeat(ITEM_COL_WIDTH)}-+-${"-".repeat(PRICE_COL_WIDTH)}-+-${"-".repeat(STATUS_COL_WIDTH)}`
  ];
}

function buildRows(items) {
  return items.map((item) => [
    padCell(item.item, ITEM_COL_WIDTH),
    padCell(formatPoints(item.price), PRICE_COL_WIDTH),
    padCell(toStatusLabel(item.status), STATUS_COL_WIDTH)
  ].join(" | "));
}

function toSection(rows) {
  return `\`\`\`\n${rows.join("\n")}\n\`\`\``;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("shop")
    .setDescription("Mở danh sách chợ đen bí ẩn"),

  async execute(interaction) {
    const items = await ShopItem.find({ status: { $ne: "hidden" } })
      .sort({ item: 1, createdAt: 1 })
      .lean();

    if (!items.length) {
      const emptyEmbed = buildEmbed({
        title: "CHỢ ĐEN",
        description: "Chợ đen đang im ắng. Chưa có mặt hàng nào lên kệ.",
        color: 0x4f596b
      });
      return interaction.reply({ embeds: [emptyEmbed] });
    }

    const headerRows = buildTableHeader();
    const bodyRows = buildRows(items);
    const sections = [];

    for (let i = 0; i < bodyRows.length; i += ROWS_PER_PAGE) {
      const pageRows = bodyRows.slice(i, i + ROWS_PER_PAGE);
      sections.push(toSection([...headerRows, ...pageRows]));
    }

    const embeds = buildPagedEmbeds({
      title: "CHỢ ĐEN",
      sections,
      color: 0x7b3fe4,
      emptyDescription: "Chợ đen đang im ắng. Chưa có mặt hàng nào lên kệ."
    });

    return interaction.reply({ embeds });
  }
};
