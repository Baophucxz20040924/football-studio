const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const { buildEmbed, getOrCreateUser } = require("./utils");
const { createAviatorToken, TOKEN_TTL_MS } = require("../../aviator/token");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("aviator")
    .setDescription("Mo game Aviator"),
  async execute(interaction) {
    const userName = interaction.user.globalName || interaction.user.username;
    await getOrCreateUser(interaction.user.id, userName);

    const token = createAviatorToken(interaction.user.id);
    const baseUrl = process.env.PUBLIC_BASE_URL || "http://localhost:3000";
    const link = `${baseUrl}/aviator?token=${encodeURIComponent(token)}`;

    const embed = buildEmbed({
      title: "Aviator Crash Game ✈️",
      description: `Nhan nut ben duoi de vao game. Link co hieu luc trong ${Math.round(TOKEN_TTL_MS / 60000)} phut.`,
      color: 0x6ae4c5
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
