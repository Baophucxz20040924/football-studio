const { REST, Routes } = require("discord.js");
require("dotenv").config();

const { getCommandData } = require("./discord/commands");

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId) {
  console.error("DISCORD_TOKEN and CLIENT_ID are required.");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(token);

async function deploy() {
  const data = getCommandData();
  const route = guildId
    ? Routes.applicationGuildCommands(clientId, guildId)
    : Routes.applicationCommands(clientId);

  await rest.put(route, { body: data });
  console.log("Commands deployed.");
}

deploy().catch((err) => {
  console.error(err);
  process.exit(1);
});
