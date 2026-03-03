const path = require("path");
const { AttachmentBuilder, SlashCommandBuilder } = require("discord.js");
const { buildEmbed } = require("./utils");

const DONATE_IMAGE_PATH = path.join(__dirname, "../../img/donate.jpg");

function buildDonateDescription() {
  const donateLines = [
    process.env.DONATE_BANK_NAME && `**Bank:** ${process.env.DONATE_BANK_NAME}`,
    process.env.DONATE_ACCOUNT_NO && `**Account No:** ${process.env.DONATE_ACCOUNT_NO}`,
    process.env.DONATE_ACCOUNT_NAME && `**Account Name:** ${process.env.DONATE_ACCOUNT_NAME}`,
    process.env.DONATE_MOMO && `**MoMo:** ${process.env.DONATE_MOMO}`,
    process.env.DONATE_NOTE && `**Transfer Note:** ${process.env.DONATE_NOTE}`
  ].filter(Boolean);

  if (donateLines.length === 0) {
    return [
      "If this bot helps you, you can buy me a coffee ☕",
      "",
      "Scan the QR in the image or contact admin for donation details."
    ].join("\n");
  }

  return [
    "If this bot helps you, you can buy me a coffee ☕",
    "",
    ...donateLines
  ].join("\n");
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("donate")
    .setDescription("Buy me a coffee to support the bot"),
  async execute(interaction) {
    const embed = buildEmbed({
      title: "Buy Me a Coffee ☕",
      description: buildDonateDescription(),
      color: 0x6ae4c5
    }).setImage("attachment://donate.jpg");

    const donateImage = new AttachmentBuilder(DONATE_IMAGE_PATH, { name: "donate.jpg" });
    return interaction.reply({ embeds: [embed], files: [donateImage] });
  }
};
