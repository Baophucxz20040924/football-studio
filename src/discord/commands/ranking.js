const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const User = require('../../models/User');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ranking')
    .setDescription('Xem top người giàu nhất'),
  async execute(interaction) {
    try {
      const adminId = '386863309691027458';
      const users = await User.find({ userId: { $ne: adminId } }, { userId: 1, userName: 1, balance: 1 })
        .sort({ balance: -1 })
        .limit(5)
        .lean();
      if (!users.length) {
        await interaction.reply('Không có dữ liệu ranking.');
        return;
      }
      const medals = [
        ':first_place_medal:',
        ':second_place_medal:',
        ':third_place_medal:'
      ];
      const { formatPoints } = require('./utils');
      const fields = users.map((u, idx) => {
        let prefix = '';
        if (idx === 0) {
          prefix = '🥇';
        } else if (idx === 1) {
          prefix = '🥈';
        } else if (idx === 2) {
          prefix = '🥉';
        } else {
          prefix = `#${idx + 1}`;
        }
        let nameStyle = idx === 0 ? `**${u.userName || u.userId}**` : idx === 1 ? `*${u.userName || u.userId}*` : idx === 2 ? `__${u.userName || u.userId}__` : `${u.userName || u.userId}`;
        return {
          name: `${prefix} ${nameStyle}`,
          value: `${formatPoints(u.balance)} điểm`,
          inline: false
        };
      });
      await interaction.reply({
        embeds: [{
          color: 0xFFD700,
          title: '🏆 Top người giàu nhất',
          fields: fields,
          timestamp: new Date().toISOString(),
        }]
      });
    } catch (error) {
      console.error('Ranking command error:', error);
      await interaction.reply({ content: 'Lỗi khi lấy ranking.', flags: MessageFlags.Ephemeral });
    }
  },
};
