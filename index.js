require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");

console.log("Testando conexão com Discord...");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.on("ready", () => {
  console.log("✅ CONECTOU NO DISCORD!");
});

client.on("error", console.error);
client.on("shardError", console.error);
client.on("debug", console.log);

client.login(process.env.DISCORD_TOKEN)
  .then(() => console.log("Login enviado"))
  .catch(err => console.error("Erro no login:", err));
