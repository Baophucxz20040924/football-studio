const { SlashCommandBuilder } = require("discord.js");
const { buildEmbed } = require("./utils");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("helpbet")
    .setDescription("Hướng dẫn đặt cược bằng lệnh /bet"),
  async execute(interaction) {
    const description = [
      "**🎯 /BET - Hướng dẫn nhanh**",
      "",
      "**Cú pháp:**",
      "`/bet match_code:<mã_trận> pick_key:<kèo> amount:<điểm>`",
      "",
      "**Ý nghĩa tham số:**",
      "• `match_code`: Mã trận lấy từ lệnh `/matches`",
      "• `pick_key`: Mã kèo (VD: `W1`, `W2`, `D`) tùy từng trận",
      "• `amount`: Số điểm muốn cược (phải > 0)",
      "",
      "**Các bước đặt cược:**",
      "1. Dùng `/matches` để xem trận đang mở và lấy mã trận",
      "2. Chọn `pick_key` đúng theo odds hiển thị",
      "3. Dùng `/bet` để đặt cược trước giờ kickoff",
      "",
      "**Ví dụ:**",
      "`/bet match_code:123 pick_key:W1 amount:100`",
      "",
      "**Lưu ý:**",
      "• Trận đến giờ đá sẽ tự khóa cược",
      "• Nhập sai `pick_key` bot sẽ trả về danh sách kèo hợp lệ",
      "• Nếu số dư không đủ, lệnh sẽ bị từ chối",
      "• W1 = Cửa 1 thắng, W2 = Cửa 2 thắng, D = Hòa",
      "• T(trái) = tổng số điểm ghi bàn lớn hơn số (trái) thì thắng kèo tài(trái), ngược lại là X(trái) = thấp hơn số ghi bàn",
      "• TG(trái) = tổng số lần đá phạt góc lớn hơn số (trái) thì thắng kèo tài(trái), ngược lại là X(trái)",
    ].join("\n");

    const embed = buildEmbed({
      title: "Hướng dẫn đặt cược 🎯",
      description,
      color: 0x6ae4c5
    });

    return interaction.reply({ embeds: [embed] });
  }
};
