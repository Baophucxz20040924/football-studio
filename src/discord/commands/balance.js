const { SlashCommandBuilder } = require("discord.js");
const { buildEmbed, getOrCreateUser } = require("./utils");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Show your balance"),
  async execute(interaction) {
    const userName = interaction.user.globalName || interaction.user.username;
    const user = await getOrCreateUser(interaction.user.id, userName);
    const embed = buildEmbed({
      title: "Your balance \ud83d\udcb0",
      description: `You have **${user.balance}** points available. \ud83e\ude99`,
      color: 0x6ae4c5
    });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
