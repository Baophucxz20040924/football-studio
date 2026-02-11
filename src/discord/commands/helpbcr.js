const { SlashCommandBuilder } = require("discord.js");
const { buildEmbed } = require("./utils");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("helpbcr")
    .setDescription("Hướng dẫn chơi Baccarat"),
  async execute(interaction) {
    const description = [
      "**🎴 BACCARAT - Luật chơi**",
      "",
      "**Mục tiêu:**",
      "Dự đoán bên nào có tổng điểm gần 9 nhất: Player, Banker hoặc Tie.",
      "",
      "**Giá trị lá bài:**",
      "• A = 1 | 2-9 = đúng số | 10,J,Q,K = 0",
      "• Chỉ lấy hàng đơn vị (VD: 8+7=15 → 5 điểm)",
      "",
      "**Cách chia bài:**",
      "• Player rút 2 lá đầu",
      "• Banker rút 2 lá đầu",
      "• Nếu có ai ≥8 điểm → DỪNG (Natural)",
      "• Nếu không → theo luật rút lá 3",
      "",
      "**Luật rút lá 3 - Player (rút trước):**",
      "• 0-5 điểm → Rút thêm 1 lá",
      "• 6-7 điểm → Dừng",
      "",
      "**Luật rút lá 3 - Banker (nhìn lá 3 Player):**",
      "• 0-2 điểm → Rút",
      "• 3 điểm → Rút nếu Player không phải 8",
      "• 4 điểm → Rút nếu Player là 2-7",
      "• 5 điểm → Rút nếu Player là 4-7",
      "• 6 điểm → Rút nếu Player là 6-7",
      "• 7 điểm → Dừng",
      "",
      "**Tỷ lệ ăn cược:**",
      "• Player thắng: 1:1 (x2 điểm)",
      "• Banker thắng: 1:0.95 (x1.95 điểm)",
      "• Tie (Hòa): 1:9 (x10 điểm)",
      "",
      "**⏱️ Thời gian cược:**",
      "Mỗi phiên có 30 giây để đặt cược. Animation rút bài cách 3 giây/lá.",
      "",
      "**🛑 Kết thúc:**",
      "Sau 4 phiên liên tiếp không có ai cược, game sẽ tự động dừng.",
      "",
      "**Mẹo:** Banker thường thắng hơn vì luật rút của Banker được thiết kế lợi hơn!"
    ].join("\n");

    const embed = buildEmbed({
      title: "Hướng dẫn Baccarat 🎴",
      description,
      color: 0xf6c244
    });

    return interaction.reply({ embeds: [embed] });
  }
};
