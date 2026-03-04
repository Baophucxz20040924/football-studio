const { MessageFlags } = require("discord.js");

const commands = [
  require("./matches"),
  require("./nba"),
  require("./bet-epl"),
  require("./bet-nba"),
  require("./balance"),
  require("./bets"),
  require("./live-epl"),
  require("./live-nba"),
  require("./help"),
  require("./give"),
  require("./aviator"),
  require("./tienlen"),
  require("./football"),
  require("./bcr"),
  require("./bj"),
  require("./tx"),
  require("./helpfootball"),
  require("./helpbcr"),
  require("./helpbet"),
  require("./daily"),
  require("./work"),
  require("./ranking"),
  require("./epl-rank"),
  require("./donate"),
  require("./sync-now")
];

function getCommandData() {
  return commands.map((cmd) => cmd.data.toJSON());
}

function isIgnorableInteractionError(error) {
  return error?.code === 10062 || error?.code === 40060;
}

function isRetryableInteractionError(error) {
  const status = Number(error?.status);
  if (Number.isFinite(status) && status >= 500) {
    return true;
  }

  const code = String(error?.code || "");
  return code === "ECONNRESET" || code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT";
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeInteractionResponseOptions(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    return options;
  }

  if (options.ephemeral === true) {
    const normalized = { ...options };
    delete normalized.ephemeral;

    const currentFlags = Number(normalized.flags ?? 0);
    normalized.flags = (Number.isFinite(currentFlags) ? currentFlags : 0) | MessageFlags.Ephemeral;
    return normalized;
  }

  return options;
}

async function withInteractionRetry(action) {
  let lastError;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (!isRetryableInteractionError(error) || attempt === 2) {
        throw error;
      }

      await wait(300 * (attempt + 1));
    }
  }

  throw lastError;
}

function wrapInteractionResponseMethods(interaction) {
  if (interaction.__responseRetryWrapped) {
    return;
  }

  const methodNames = ["reply", "followUp", "editReply", "deferReply", "update", "deferUpdate"];
  for (const methodName of methodNames) {
    if (typeof interaction[methodName] !== "function") {
      continue;
    }

    const originalMethod = interaction[methodName].bind(interaction);
    interaction[methodName] = (...args) => {
      const normalizedArgs = [...args];
      if (normalizedArgs.length > 0) {
        normalizedArgs[0] = normalizeInteractionResponseOptions(normalizedArgs[0]);
      }
      return withInteractionRetry(() => originalMethod(...normalizedArgs));
    };
  }

  interaction.__responseRetryWrapped = true;
}

async function handleInteraction(interaction) {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  wrapInteractionResponseMethods(interaction);

  const command = commands.find((cmd) => cmd.data.name === interaction.commandName);
  if (!command) {
    return;
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    if (isIgnorableInteractionError(err)) {
      return;
    }

     if (isRetryableInteractionError(err)) {
      console.warn("Discord API temporary failure while handling interaction", {
        command: interaction.commandName,
        status: err?.status,
        code: err?.code
      });
      return;
    }

    console.error(err);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: "Something went wrong.", flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content: "Something went wrong.", flags: MessageFlags.Ephemeral });
      }
    } catch (replyError) {
      if (!isIgnorableInteractionError(replyError)) {
        console.error(replyError);
      }
    }
  }
}

module.exports = {
  getCommandData,
  handleInteraction
};
