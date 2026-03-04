const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { buildEmbed } = require("./utils");

const ALLOWED_USER_ID = "386863309691027458";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("sync-now")
    .setDescription("Manual sync EPL/NBA ngay lập tức"),
  async execute(interaction) {
    if (interaction.user.id !== ALLOWED_USER_ID) {
      return interaction.reply({
        content: "Bạn không có quyền dùng lệnh này.",
        flags: MessageFlags.Ephemeral
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const baseUrl = `http://127.0.0.1:${process.env.PORT || 3000}`;

    try {
      const response = await fetch(`${baseUrl}/api/admin/sync-now`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ forcePrematch: true })
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text || "unknown error"}`);
      }

      const result = await response.json();
      const startedAt = result?.startedAt ? new Date(result.startedAt).toLocaleString("en-US") : "-";
      const finishedAt = result?.finishedAt ? new Date(result.finishedAt).toLocaleString("en-US") : "-";

      const embed = buildEmbed({
        title: "Manual sync done ✅",
        description: [
          `Force prematch: **${result?.forcePrematch ? "ON" : "OFF"}**`,
          `Started: **${startedAt}**`,
          `Finished: **${finishedAt}**`
        ].join("\n"),
        color: 0x6ae4c5
      });

      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      return interaction.editReply({
        content: `Sync failed: ${error?.message || "unknown error"}`
      });
    }
  }
};