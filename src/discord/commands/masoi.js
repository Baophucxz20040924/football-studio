const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require("discord.js");
const { buildEmbed } = require("./utils");
const { acquireChannelGameLock, releaseChannelGameLock } = require("./channelLocks");

const LOBBY_TIMEOUT_MS = 90_000;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 12;

const sessions = new Map();
let sessionCounter = 0;

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildRoles(playerCount) {
  const werewolfCount = playerCount >= 10 ? 2 : 1;
  const seerCount = playerCount >= 7 ? 1 : 0;
  const villagerCount = playerCount - werewolfCount - seerCount;

  return [
    ...Array.from({ length: werewolfCount }, () => "ma_soi"),
    ...Array.from({ length: seerCount }, () => "tien_tri"),
    ...Array.from({ length: villagerCount }, () => "dan_lang")
  ];
}

function roleLabel(role) {
  if (role === "ma_soi") return "Ma Soi";
  if (role === "tien_tri") return "Tien Tri";
  return "Dan Lang";
}

function roleDescription(role) {
  if (role === "ma_soi") {
    return "Ban thuoc phe Ma Soi. Ban dem se cung phe Ma Soi chon muc tieu.";
  }
  if (role === "tien_tri") {
    return "Ban la Tien Tri. Moi dem duoc soi 1 nguoi de biet phe cua ho.";
  }
  return "Ban la Dan Lang. Ban hay tim ra Ma Soi vao ban ngay.";
}

function playerMentions(session) {
  return [...session.players.values()].map((player) => `<@${player.userId}>`);
}

function buildLobbyEmbed(session, statusText) {
  const mentions = playerMentions(session);
  const playerLines = mentions.length > 0
    ? mentions.map((mention, index) => `${index + 1}. ${mention}`).join("\n")
    : "Chua co ai tham gia.";

  return buildEmbed({
    title: "Ma Soi - Phong cho",
    description: [
      `Host: <@${session.hostId}>`,
      `So nguoi: **${session.players.size}/${MAX_PLAYERS}** (toi thieu ${MIN_PLAYERS})`,
      "",
      playerLines,
      "",
      statusText || "Nhan **Tham gia** de vao phong."
    ].join("\n"),
    color: 0x7f5af0
  });
}

function buildLobbyRow(sessionId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`masoi:${sessionId}:join`)
      .setLabel("Tham gia")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`masoi:${sessionId}:leave`)
      .setLabel("Roi phong")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`masoi:${sessionId}:start`)
      .setLabel("Bat dau")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`masoi:${sessionId}:cancel`)
      .setLabel("Huy")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
  );
}

async function assignAndNotifyRoles(channel, session) {
  const players = [...session.players.values()];
  const shuffledPlayers = shuffle(players);
  const shuffledRoles = shuffle(buildRoles(players.length));

  for (let i = 0; i < shuffledPlayers.length; i += 1) {
    shuffledPlayers[i].role = shuffledRoles[i];
  }

  for (const player of shuffledPlayers) {
    const member = await channel.guild.members.fetch(player.userId).catch(() => null);
    if (!member) {
      continue;
    }

    await member.send({
      embeds: [
        buildEmbed({
          title: "Vai tro Ma Soi",
          description: [
            `Vai tro cua ban: **${roleLabel(player.role)}**`,
            roleDescription(player.role),
            "",
            "Game da bat dau, hay theo doi channel co tham gia."
          ].join("\n"),
          color: 0xf6c244
        })
      ]
    }).catch(() => null);
  }

  const werewolf = shuffledPlayers.filter((p) => p.role === "ma_soi").length;
  const seer = shuffledPlayers.filter((p) => p.role === "tien_tri").length;

  await channel.send({
    embeds: [
      buildEmbed({
        title: "Ma Soi - Bat dau",
        description: [
          `Da chia vai cho **${shuffledPlayers.length}** nguoi choi qua DM.`,
          `Co cau: **${werewolf} Ma Soi**, **${seer} Tien Tri**, con lai Dan Lang.`,
          "",
          "Ban dem se bat dau ngay. Moi nguoi theo doi kenh nay."
        ].join("\n"),
        color: 0x3da9fc
      })
    ]
  });
}

async function runLobby(message, session) {
  const collector = message.createMessageComponentCollector({
    time: LOBBY_TIMEOUT_MS
  });

  collector.on("collect", async (btn) => {
    const [prefix, sessionId, action] = btn.customId.split(":");
    if (prefix !== "masoi" || sessionId !== session.id) {
      await btn.reply({
        content: "Phong cho nay da het han.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const userId = btn.user.id;

    if (action === "join") {
      if (session.players.has(userId)) {
        await btn.reply({ content: "Ban da o trong phong roi.", flags: MessageFlags.Ephemeral });
        return;
      }

      if (session.players.size >= MAX_PLAYERS) {
        await btn.reply({ content: "Phong da day.", flags: MessageFlags.Ephemeral });
        return;
      }

      session.players.set(userId, {
        userId,
        userName: btn.user.globalName || btn.user.username,
        alive: true,
        role: null
      });

      await btn.update({
        embeds: [buildLobbyEmbed(session, `<@${userId}> da tham gia phong.`)],
        components: [buildLobbyRow(session.id)]
      });
      return;
    }

    if (action === "leave") {
      if (userId === session.hostId) {
        await btn.reply({
          content: "Host khong the roi phong. Neu muon dung game hay bam Huy.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (!session.players.has(userId)) {
        await btn.reply({ content: "Ban chua tham gia phong.", flags: MessageFlags.Ephemeral });
        return;
      }

      session.players.delete(userId);
      await btn.update({
        embeds: [buildLobbyEmbed(session, `<@${userId}> da roi phong.`)],
        components: [buildLobbyRow(session.id)]
      });
      return;
    }

    if (action === "start") {
      if (userId !== session.hostId) {
        await btn.reply({
          content: "Chi host moi duoc bat dau.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (session.players.size < MIN_PLAYERS) {
        await btn.reply({
          content: `Can it nhat ${MIN_PLAYERS} nguoi choi de bat dau.`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      session.started = true;
      await btn.update({
        embeds: [buildLobbyEmbed(session, "Game dang bat dau...")],
        components: [buildLobbyRow(session.id, true)]
      });
      collector.stop("started");
      return;
    }

    if (action === "cancel") {
      if (userId !== session.hostId) {
        await btn.reply({ content: "Chi host moi duoc huy game.", flags: MessageFlags.Ephemeral });
        return;
      }

      session.canceled = true;
      await btn.update({
        embeds: [buildLobbyEmbed(session, "Host da huy phong cho.")],
        components: [buildLobbyRow(session.id, true)]
      });
      collector.stop("canceled");
      return;
    }

    await btn.reply({ content: "Hanh dong khong hop le.", flags: MessageFlags.Ephemeral });
  });

  return await new Promise((resolve) => {
    collector.on("end", async (_, reason) => {
      if (!session.started && !session.canceled) {
        await message.edit({
          embeds: [buildLobbyEmbed(session, "Het thoi gian cho. Hay chay lai /masoi de tao phong moi.")],
          components: [buildLobbyRow(session.id, true)]
        }).catch(() => null);
      }

      resolve(reason);
    });
  });
}

const NIGHT_PHASE_MS = 20_000;
const DISCUSSION_PHASE_MS = 90_000;
const VOTE_PHASE_MS = 45_000;

function buildNightEmbed(round, aliveCount) {
  return buildEmbed({
    title: "Ban Dem",
    description: [
      `Vong: **${round}**`,
      `Nguoi con song: **${aliveCount}**`,
      "",
      "Ma Soi dang chon muc tieu...",
      "Tien Tri (neu co) dang soi..."
    ].join("\n"),
    color: 0x1f1f3d
  });
}

function buildDayEmbed(round, aliveCount, deadName = null) {
  const deadLine = deadName ? `Ty phu dem qua: **${deadName}** bi Ma Soi tieu diet.` : "Khong ai bi tieu diet dem qua.";
  return buildEmbed({
    title: "Ban Ngay",
    description: [
      `Vong: **${round}**`,
      `Nguoi con song: **${aliveCount}**`,
      "",
      deadLine,
      "",
      "Moi nguoi hay vote treo cau 1 nguoi trong 25 giay."
    ].join("\n"),
    color: 0xf5c844
  });
}

function buildKillTargetRow(sessionId, alivePlayers) {
  const rows = [];
  const maxButtonsPerRow = 5;

  for (let i = 0; i < alivePlayers.length; i += maxButtonsPerRow) {
    const batch = alivePlayers.slice(i, i + maxButtonsPerRow);
    const row = new ActionRowBuilder();

    for (const player of batch) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`masoi:${sessionId}:kill:${player.userId}`)
          .setLabel(player.userName.slice(0, 20))
          .setStyle(ButtonStyle.Danger)
      );
    }

    rows.push(row);
  }

  return rows;
}

function buildVoteRow(sessionId, alivePlayers) {
  const rows = [];
  const maxButtonsPerRow = 5;

  for (let i = 0; i < alivePlayers.length; i += maxButtonsPerRow) {
    const batch = alivePlayers.slice(i, i + maxButtonsPerRow);
    const row = new ActionRowBuilder();

    for (const player of batch) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`masoi:${sessionId}:vote:${player.userId}`)
          .setLabel(player.userName.slice(0, 20))
          .setStyle(ButtonStyle.Primary)
      );
    }

    rows.push(row);
  }

  return rows;
}

async function runNightPhase(channel, session) {
  const round = (session.round || 0) + 1;
  session.round = round;
  session.nightKill = null;
  session.seerScan = null;

  const alivePlayers = [...session.players.values()].filter((p) => p.alive);

  await channel.send({
    embeds: [buildEmbed({
      title: `Ban Dem - Vong ${round}`,
      description: `Nguoi con song: **${alivePlayers.length}**\n\nBan dem se ket thuc trong 30 giay. Ma Soi va Tien Tri (neu co) dang chon muc tieu...`,
      color: 0x1f1f3d
    })]
  }).catch(() => null);

  const werewolves = alivePlayers.filter((p) => p.role === "ma_soi");
  const seers = alivePlayers.filter((p) => p.role === "tien_tri");

  if (werewolves.length > 0) {
    const killButtons = buildKillTargetRow(session.id, alivePlayers.filter((p) => p.role !== "ma_soi"));

    for (const werewolf of werewolves) {
      const member = await channel.guild.members.fetch(werewolf.userId).catch(() => null);
      if (!member) continue;

      await member.send({
        embeds: [buildEmbed({
          title: "Ban Dem - Chon Muc Tieu (30s)",
          description: "Hay bam nut de chon muc tieu can tieu diet. Neu khong chon trong 30s se bo qua.",
          color: 0xff4500
        })],
        components: killButtons
      }).then(async (dm) => {
        const collector = dm.createMessageComponentCollector({
          time: NIGHT_PHASE_MS,
          filter: (i) => i.user.id === werewolf.userId
        });

        collector.on("collect", async (btn) => {
          const targetId = btn.customId.split(":")[3];
          session.nightKill = targetId;
          await btn.reply({
            content: "Da xac nhan muc tieu.",
            flags: MessageFlags.Ephemeral
          }).catch(() => null);
          collector.stop();
        });

        await new Promise((resolve) => collector.on("end", resolve));
      }).catch(() => null);
    }

    await new Promise((resolve) => setTimeout(resolve, NIGHT_PHASE_MS));
  }

  if (seers.length > 0) {
    const scanButtons = buildKillTargetRow(session.id, alivePlayers.filter((p) => p.role !== "tien_tri"));

    for (const seer of seers) {
      const member = await channel.guild.members.fetch(seer.userId).catch(() => null);
      if (!member) continue;

      await member.send({
        embeds: [buildEmbed({
          title: "Ban Dem - Soi Dan (30s)",
          description: "Hay bam nut de soi phe cua 1 nguoi. Neu khong chon trong 30s se bo qua.",
          color: 0x4169e1
        })],
        components: scanButtons
      }).then(async (dm) => {
        const collector = dm.createMessageComponentCollector({
          time: NIGHT_PHASE_MS,
          filter: (i) => i.user.id === seer.userId
        });

        collector.on("collect", async (btn) => {
          const targetId = btn.customId.split(":")[3];
          const target = [...session.players.values()].find((p) => p.userId === targetId);
          const targetRole = target?.role || "unknown";
          session.seerScan = { targetId, role: targetRole };
          await btn.reply({
            content: `<@${targetId}> la **${roleLabel(targetRole)}**.`,
            flags: MessageFlags.Ephemeral
          }).catch(() => null);
          collector.stop();
        });

        await new Promise((resolve) => collector.on("end", resolve));
      }).catch(() => null);
    }

    await new Promise((resolve) => setTimeout(resolve, NIGHT_PHASE_MS));
  }

  if (session.nightKill) {
    const killed = [...session.players.values()].find((p) => p.userId === session.nightKill);
    if (killed) {
      killed.alive = false;
      await channel.send({
        embeds: [buildEmbed({
          title: "Sang Ngay - Suat Vong Trag Dem",
          description: `**${killed.userName}** bi Ma Soi tieu diet. Vai tro: **${roleLabel(killed.role)}**`,
          color: 0x8b0000
        })]
      }).catch(() => null);
    }
  }
}

async function runDayPhase(channel, session) {
  const alivePlayers = [...session.players.values()].filter((p) => p.alive);
  const lastKilled = session.nightKill ? [...session.players.values()].find((p) => p.userId === session.nightKill && !p.alive) : null;

  // Phase 1: Thong bao va thao luan (90s)
  await channel.send({
    embeds: [buildEmbed({
      title: `Ban Ngay - Vong ${session.round}`,
      description: lastKilled 
        ? `**${lastKilled.userName}** bi Ma Soi tieu diet dem qua. Vai tro: **${roleLabel(lastKilled.role)}**\n\nNguoi con song: **${alivePlayers.length}**\n\nThao luan trong 1 phut 30 giay. Sau do se vote.`
        : `Khong ai bi tieu diet dem qua.\n\nNguoi con song: **${alivePlayers.length}**\n\nThao luan trong 1 phut 30 giay. Sau do se vote.`,
      color: 0xf5c844
    })],
    content: alivePlayers.map((p) => `<@${p.userId}>`).join(" ")
  }).catch(() => null);

  await new Promise((resolve) => setTimeout(resolve, DISCUSSION_PHASE_MS));

  // Phase 2: Vote (45s)
  await channel.send({
    embeds: [buildEmbed({
      title: "Ban Ngay - Vote Treo Cau (45s)",
      description: "Vote xong trong 45 giay de treo cau.",
      color: 0xf5c844
    })]
  }).catch(() => null);

  const votes = new Map();

  for (const player of alivePlayers) {
    const member = await channel.guild.members.fetch(player.userId).catch(() => null);
    if (!member) continue;

    const voteButtons = buildVoteRow(session.id, alivePlayers);

    await member.send({
      embeds: [buildEmbed({
        title: "Ban Ngay - Vote Treo Cau (45s)",
        description: "Hay bam nut de vote treo cau ai.",
        color: 0xf5c844
      })],
      components: voteButtons
    }).then(async (dm) => {
      const collector = dm.createMessageComponentCollector({
        time: VOTE_PHASE_MS,
        filter: (i) => i.user.id === player.userId
      });

      collector.on("collect", async (btn) => {
        const targetId = btn.customId.split(":")[3];
        votes.set(player.userId, targetId);
        await btn.reply({
          content: "Ban da vote.",
          flags: MessageFlags.Ephemeral
        }).catch(() => null);
        collector.stop();
      });

      await new Promise((resolve) => collector.on("end", resolve));
    }).catch(() => null);
  }

  await new Promise((resolve) => setTimeout(resolve, VOTE_PHASE_MS));

  if (votes.size > 0) {
    const voteCount = new Map();
    for (const targetId of votes.values()) {
      voteCount.set(targetId, (voteCount.get(targetId) || 0) + 1);
    }

    let maxVotes = 0;
    let hangTarget = null;
    for (const [targetId, count] of voteCount) {
      if (count > maxVotes) {
        maxVotes = count;
        hangTarget = targetId;
      }
    }

    if (hangTarget) {
      const hanged = [...session.players.values()].find((p) => p.userId === hangTarget);
      if (hanged) {
        hanged.alive = false;
        await channel.send({
          embeds: [buildEmbed({
            title: "Treo Cau",
            description: `**${hanged.userName}** bi treo cau. Vai tro: **${roleLabel(hanged.role)}**`,
            color: 0x8b0000
          })]
        }).catch(() => null);
      }
    }
  }
}

function checkWinCondition(session) {
  const alive = [...session.players.values()].filter((p) => p.alive);
  const werewolves = alive.filter((p) => p.role === "ma_soi");
  const villagers = alive.filter((p) => p.role !== "ma_soi");

  if (werewolves.length === 0) {
    return {
      end: true,
      winners: "dan_lang",
      message: `Dan Lang thang! Tat ca Ma Soi da bi loai.\n\nNguoi chiep thang: ${villagers.map((p) => `<@${p.userId}>`).join(", ") || "Khong co"}`
    };
  }

  if (werewolves.length >= villagers.length) {
    return {
      end: true,
      winners: "ma_soi",
      message: `Ma Soi thang! So Ma Soi >= so Dan Lang con lai.\n\nNguoi chiep thang: ${werewolves.map((p) => `<@${p.userId}>`).join(", ") || "Khong co"}`
    };
  }

  return { end: false };
}

async function runGameLoop(channel, session) {
  session.round = 0;

  while (true) {
    await runNightPhase(channel, session);
    
    const checkAfterNight = checkWinCondition(session);
    if (checkAfterNight.end) {
      await channel.send({
        embeds: [buildEmbed({
          title: "KET THUC GAME",
          description: checkAfterNight.message,
          color: 0xffd700
        })]
      }).catch(() => null);
      break;
    }

    await runDayPhase(channel, session);

    const checkAfterDay = checkWinCondition(session);
    if (checkAfterDay.end) {
      await channel.send({
        embeds: [buildEmbed({
          title: "KET THUC GAME",
          description: checkAfterDay.message,
          color: 0xffd700
        })]
      }).catch(() => null);
      break;
    }
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("masoi")
    .setDescription("Mo phong cho Ma Soi (ban demo de)"),

  async execute(interaction) {
    if (!interaction.channel) {
      return interaction.reply({
        content: "Lenh nay chi dung trong server.",
        flags: MessageFlags.Ephemeral
      });
    }

    const channelId = interaction.channelId;
    const lockedBy = acquireChannelGameLock(channelId, "Ma Soi");
    if (lockedBy) {
      return interaction.reply({
        content: `${lockedBy} dang chay o kenh nay. Hay doi game hien tai ket thuc.`,
        flags: MessageFlags.Ephemeral
      });
    }

    const hostName = interaction.user.globalName || interaction.user.username;
    const session = {
      id: String(++sessionCounter),
      channelId,
      hostId: interaction.user.id,
      started: false,
      canceled: false,
      players: new Map([
        [
          interaction.user.id,
          {
            userId: interaction.user.id,
            userName: hostName,
            alive: true,
            role: null
          }
        ]
      ])
    };

    sessions.set(channelId, session);

    try {
      await interaction.reply({
        embeds: [buildLobbyEmbed(session, "Phong cho da tao. Moi nguoi bam Tham gia de vao game.")],
        components: [buildLobbyRow(session.id)]
      });

      const lobbyMessage = await interaction.fetchReply();
      await runLobby(lobbyMessage, session);

      if (session.started) {
        await assignAndNotifyRoles(interaction.channel, session);
        await runGameLoop(interaction.channel, session);
      }
    } finally {
      sessions.delete(channelId);
      releaseChannelGameLock(channelId);
    }
  }
};
