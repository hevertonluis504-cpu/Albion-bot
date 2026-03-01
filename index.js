require("dotenv").config();
const http = require("http");
const { Client, GatewayIntentBits } = require("discord.js");

console.log("Iniciando bot...");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once("ready", () => {
  console.log(`✅ Conectado como ${client.user.tag}`);
});

client.on("error", console.error);
client.on("shardError", console.error);

client.login(process.env.DISCORD_TOKEN)
  .then(() => console.log("🔐 Login enviado"))
  .catch(err => console.error("Erro no login:", err));

/* SERVIDOR HTTP OBRIGATÓRIO NO WEB SERVICE */
const port = process.env.PORT || 10000;

http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Bot online");
}).listen(port, "0.0.0.0", () => {
  console.log("🌐 Porta aberta:", port);
});
