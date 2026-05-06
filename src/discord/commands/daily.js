const { SlashCommandBuilder } = require("discord.js");
const { buildEmbed, getOrCreateUser, formatPoints } = require("./utils");

const BASE_REWARD = 500;
const BONUS_PER_DAY = 120;

function isSameDay(date1, date2) {
  if (!date1 || !date2) return false;
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

function isYesterday(date1, date2) {
  if (!date1 || !date2) return false;
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  d1.setDate(d1.getDate() + 1);
  return isSameDay(d1, d2);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Điểm danh hàng ngày nhận điểm thưởng"),
  async execute(interaction) {
    const userName = interaction.user.globalName || interaction.user.username;
    const user = await getOrCreateUser(interaction.user.id, userName);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if already claimed today
    if (user.lastDailyClaimDate && isSameDay(user.lastDailyClaimDate, today)) {
      const embed = buildEmbed({
        title: "Đã điểm danh ✅",
        description: [
          `Bạn đã điểm danh hôm nay rồi! 🤔`,
          `Quay lại vào ngày mai để nhận thêm điểm.`,
          `Ngày điểm danh liên tiếp: **${user.consecutiveDays}** ngày`
        ].join("\n"),
        color: 0xf36c5c
      });
      return interaction.reply({ embeds: [embed] });
    }

    // Check if it's a consecutive day
    let newConsecutive = 1;
    if (user.lastDailyClaimDate) {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      if (isSameDay(user.lastDailyClaimDate, yesterday)) {
        newConsecutive = user.consecutiveDays + 1;
      }
    }

    // Calculate reward
    const reward = BASE_REWARD + newConsecutive * BONUS_PER_DAY;

    // Update user
    user.lastDailyClaimDate = today;
    user.consecutiveDays = newConsecutive;
    user.balance += reward;
    await user.save();

    const embed = buildEmbed({
      title: "Điểm danh thành công! ✨",
      description: [
        `Bạn nhận được: **${formatPoints(reward)}** điểm`,
        `Ngày điểm danh liên tiếp: **${newConsecutive}** ngày`,
        `Số dư hiện tại: **${formatPoints(user.balance)}** điểm`
      ].join("\n"),
      color: 0x22c55e
    });

    return interaction.reply({ embeds: [embed] });
  }
};
