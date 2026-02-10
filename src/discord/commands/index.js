const commands = [
  require("./matches"),
  require("./bet"),
  require("./balance"),
  require("./bets"),
  require("./live"),
  require("./help"),
  require("./give")
];

function getCommandData() {
  return commands.map((cmd) => cmd.data.toJSON());
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
    console.error(err);
    if (!interaction.replied) {
      await interaction.reply({ content: "Something went wrong.", ephemeral: true });
    }
  }
}

module.exports = {
  getCommandData,
  handleInteraction
};
