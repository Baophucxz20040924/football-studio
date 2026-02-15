const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const { buildEmbed, getOrCreateUser } = require("./utils");
const { createTienLenToken, TOKEN_TTL_MS } = require("../../tienlen/token");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("tienlen")
    .setDescription("Mở game Tiến lên Miền Trung"),
  async execute(interaction) {
    const userName = interaction.user.globalName || interaction.user.username;
    await getOrCreateUser(interaction.user.id, userName);

    const token = createTienLenToken(interaction.user.id, userName);
    const baseUrl = process.env.PUBLIC_BASE_URL || "http://localhost:3000";
    const link = `${baseUrl}/tienlen?token=${encodeURIComponent(token)}`;

    const embed = buildEmbed({
      title: "Tiến lên Miền Trung 🃏",
      description:
        "Nhấn nút bên dưới để vào game. Link có hiệu lực trong " +
        Math.round(TOKEN_TTL_MS / 60000) +
        " phút.",
      color: 0xf59e0b
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Vào game")
        .setStyle(ButtonStyle.Link)
        .setURL(link)
    );

    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }
};
