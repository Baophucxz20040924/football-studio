const { SlashCommandBuilder } = require("discord.js");
const { buildEmbed } = require("./utils");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("helpbet")
    .setDescription("Hướng dẫn đặt cược bằng /bet-epl và /bet-nba"),
  async execute(interaction) {
    const description = [
      "**🎯 BET - Hướng dẫn nhanh**",
      "",
      "**Lệnh đặt cược:**",
      "`/bet-epl` - Cược nhanh cho EPL/football",
      "`/bet-nba` - Cược nhanh cho NBA",
      "",
      "**Luồng thao tác:**",
      "1. Chọn trận từ menu",
      "2. Chọn kèo từ odds hiện có",
      "3. Chọn tiền nhanh (100/500/1000/5000/10k) hoặc bấm `Tùy chọn` để nhập số tiền",
      "4. Bấm `Confirm` để chốt cược",
      "",
      "**Lưu ý:**",
      "• Trận đến giờ đá sẽ tự khóa cược",
      "• Nếu số dư không đủ, lệnh sẽ bị từ chối",
      "• Kèo hợp lệ phụ thuộc vào odds đang mở của trận",
      "• Có thể nhập số tiền kiểu `10k`, `1m` khi dùng nút `Tùy chọn`",
    ].join("\n");

    const embed = buildEmbed({
      title: "Hướng dẫn đặt cược 🎯",
      description,
      color: 0x6ae4c5
    });

    return interaction.reply({ embeds: [embed] });
  }
};
