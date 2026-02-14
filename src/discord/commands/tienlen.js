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
    .setDescription("Mo game Tien Len Mien Bac"),
  async execute(interaction) {
    const userName = interaction.user.globalName || interaction.user.username;
    await getOrCreateUser(interaction.user.id, userName);

    const token = createTienLenToken(interaction.user.id, userName);
    const baseUrl = process.env.PUBLIC_BASE_URL || "http://localhost:3000";
    const link = `${baseUrl}/tienlen?token=${encodeURIComponent(token)}`;

    const embed = buildEmbed({
      title: "Tien Len Mien Bac 🃏",
      description:
        "Nhan nut ben duoi de vao game. Link co hieu luc trong " +
        Math.round(TOKEN_TTL_MS / 60000) +
        " phut.",
      color: 0xf59e0b
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Vao game")
        .setStyle(ButtonStyle.Link)
        .setURL(link)
    );

    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }
};
