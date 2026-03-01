const commands = [
  require("./matches"),
  require("./bet"),
  require("./balance"),
  require("./bets"),
  require("./live"),
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
  require("./ranking")
];

function getCommandData() {
  return commands.map((cmd) => cmd.data.toJSON());
}

function isIgnorableInteractionError(error) {
  return error?.code === 10062 || error?.code === 40060;
}

async function handleInteraction(interaction) {
  if (!interaction.isChatInputCommand()) {
    return;
  }

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

    console.error(err);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: "Something went wrong.", ephemeral: true });
      } else {
        await interaction.reply({ content: "Something went wrong.", ephemeral: true });
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
