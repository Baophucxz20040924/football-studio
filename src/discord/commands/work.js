const { SlashCommandBuilder } = require("discord.js");
const { buildEmbed, getOrCreateUser, formatPoints } = require("./utils");

const MIN_REWARD = 50;
const MAX_REWARD = 300;
const COOLDOWN_MS = 5 * 60 * 1000;

function randomReward(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatRemaining(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("work")
    .setDescription("Làm việc nhận điểm (mỗi 5 phút)"),
  async execute(interaction) {
    const userName = interaction.user.globalName || interaction.user.username;
    const user = await getOrCreateUser(interaction.user.id, userName);

    const now = Date.now();
    const lastWorkAt = user.lastWorkClaimAt ? user.lastWorkClaimAt.getTime() : null;

    if (lastWorkAt) {
      const elapsed = now - lastWorkAt;
      if (elapsed < COOLDOWN_MS) {
        const remaining = COOLDOWN_MS - elapsed;
        const embed = buildEmbed({
          title: "Chưa thể đi làm ⏳",
          description: [
            "Bạn vừa làm xong ca trước.",
            `Hãy quay lại sau **${formatRemaining(remaining)}**.`
          ].join("\n"),
          color: 0xf59e0b
        });

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }

    const reward = randomReward(MIN_REWARD, MAX_REWARD);
    user.balance += reward;
    user.lastWorkClaimAt = new Date(now);
    await user.save();

    const embed = buildEmbed({
      title: "Đi làm thành công 💼",
      description: [
        `Bạn nhận được: **${formatPoints(reward)}** điểm`,
        `Số dư hiện tại: **${formatPoints(user.balance)}** điểm`,
        "Bạn có thể dùng lại lệnh sau **5 phút**."
      ].join("\n"),
      color: 0x22c55e
    });

    return interaction.reply({ embeds: [embed] });
  }
};
