const { SlashCommandBuilder } = require("discord.js");
const { buildEmbed } = require("./utils");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("helpfootball")
    .setDescription("Hướng dẫn chơi Football Studio"),
  async execute(interaction) {
    const description = [
      "**⚽ FOOTBALL STUDIO - Luật chơi**",
      "",
      "**Mục tiêu:**",
      "Dự đoán kết quả trận đấu: Home (Nhà), Away (Khách) hay Draw (Hòa).",
      "",
      "**Cách chơi:**",
      "1. Nhấn nút Home/Away/Draw",
      "2. Nhập số điểm muốn cược",
      "3. Chờ 30 giây để khóa cược",
      "4. Hệ thống tự động rút 2 lá cho mỗi bên",
      "5. So sánh điểm → xác định thắng thua",
      "",
      "**Giá trị lá bài:**",
      "• A = 1 | 2-9 = đúng số | 10,J,Q,K = 0",
      "• Chỉ lấy hàng đơn vị (VD: 8+7=15 → 5 điểm)",
      "",
      "**Tỷ lệ ăn cược:**",
      "• Home thắng: 1:1 (x2 điểm)",
      "• Away thắng: 1:1 (x2 điểm)",
      "• Draw: 1:11 (x11 điểm)",
      "",
      "**⚠️ Chính sách Draw:**",
      "Nếu kết quả Draw nhưng bạn cược Home/Away:",
      "• Bạn sẽ mất **nửa số tiền cược** (hoàn 50%)",
      "",
      "**⏱️ Thời gian cược:**",
      "Mỗi phiên có 30 giây để đặt cược.",
      "",
      "**🛑 Kết thúc:**",
      "Sau 4 phiên liên tiếp không có ai cược, game sẽ tự động dừng.",
      "",
      "**💡 Tip:** Hệ số Draw cao nhưng xảy ra thường xuyên hơn bạn tưởng. Cân nhắc thêm cược Draw vào chiến lược!"
    ].join("\n");

    const embed = buildEmbed({
      title: "Hướng dẫn Football Studio ⚽",
      description,
      color: 0x22c55e
    });

    return interaction.reply({ embeds: [embed] });
  }
};
