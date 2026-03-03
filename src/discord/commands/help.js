const { SlashCommandBuilder } = require("discord.js");
const { buildEmbed } = require("./utils");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Xem hướng dẫn lệnh"),
  async execute(interaction) {
    const description = [
      "**Lệnh cơ bản**",
        "⚽ **/football** - Danh sách trận bóng đá đang mở (có mã trận)",
        "🏀 **/nba** - Danh sách trận NBA đang mở (có mã trận)",
      "\ud83c\udfaf **/bet** - Đặt cược (match_code, pick_key, amount)",
      "\ud83d\udcb0 **/balance** - Xem số dư điểm của bạn",
      "\ud83d\udcd3 **/bets** - Xem lịch sử đặt cược",
      "\ud83d\udd34 **/live** - Xem trận đang live",
      "\ud83e\udd1d **/give** - Chuyển điểm cho người khác",
      "\ud83c\udf89 **/daily** - Điểm danh nhận điểm thưởng hàng ngày",
      "\ud83d\udcbc **/work** - Đi làm mỗi 5 phút nhận ngẫu nhiên 50-300 điểm",
      "\u2764\ufe0f **/donate** - Buy me a coffee",
      "",
      "**Trò chơi casino**",
        "⚽ **/fb** - Football Studio (Home/Away/Draw)",
      "\ud83c\udfb2 **/bcr** - Baccarat (Player/Banker/Tie)",
      "🃏 **/bj** - Blackjack (đấu với dealer)",
      "🎯 **/tx** - Tài xỉu (tài/xỉu/chẵn/lẻ/số)",
      "✈️ **/aviator** - Aviator Crash Game",
      "🃏 **/tienlen** - Tiến Lên Miền Bắc",
      "",
      "**Hướng dẫn luật chơi**",
      "🧾 **/helpbet** - Hướng dẫn đặt cược bằng lệnh /bet",
      "📘 **/helpfootball** - Xem luật Football Studio",
      "📙 **/helpbcr** - Xem luật Baccarat",
      "",
      "**Ví dụ nhanh**",
      "`/bet match_code: 123 pick_key: W1 amount: 100`",
      "`/give nguoinhan: @ban sotien: 50`",
      "`/bj amount: 100`"
    ].join("\n");

    const embed = buildEmbed({
      title: "Hướng dẫn \ud83e\udd16",
      description,
      color: 0x6ae4c5
    });

    return interaction.reply({ embeds: [embed] });
  }
};
