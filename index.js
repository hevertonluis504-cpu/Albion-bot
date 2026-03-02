require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");
const moment = require("moment-timezone");
const express = require("express");

// =======================
// SERVIDOR WEB (RENDER)
// =======================
const app = express();
app.get("/", (req, res) => {
  res.send("🛡️ Albion Guild Event Bot Online 🚀");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Servidor web ativo na porta ${PORT}`);
});

// =======================
// CLIENT DISCORD
// =======================
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// =======================
// COMANDO GLOBAL
// =======================
const commands = [
  new SlashCommandBuilder()
    .setName("evento")
    .setDescription("Criar evento da guilda")
    .addStringOption(option =>
      option.setName("titulo")
        .setDescription("Título do evento")
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName("jogadores")
        .setDescription("Quantidade máxima de jogadores")
        .setRequired(true))
    .addStringOption(option =>
      option.setName("descricao")
        .setDescription("Descrição do evento")
        .setRequired(true))
];

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

// =======================
// SISTEMA EM MEMÓRIA
// =======================
let eventos = new Map();

// =======================
// READY
// =======================
client.once("ready", () => {

  console.log("=================================");
  console.log("🛡️ BOT DE EVENTOS ALBION ONLINE");
  console.log(`🤖 Logado como ${client.user.tag}`);
  console.log("⏰ Horário Brasil ativo");
  console.log("🚀 Sistema profissional iniciado");
  console.log("=================================");

  client.user.setPresence({
    activities: [{
      name: "Eventos da Guilda ⚔️",
      type: 3
    }],
    status: "online"
  });

});

// =======================
// INTERAÇÕES
// =======================
client.on("interactionCreate", async interaction => {

  // CRIAR EVENTO
  if (interaction.isChatInputCommand()) {

    if (interaction.commandName === "evento") {

      const titulo = interaction.options.getString("titulo");
      const maxJogadores = interaction.options.getInteger("jogadores");
      const descricao = interaction.options.getString("descricao");

      const dataBrasil = moment()
        .tz("America/Sao_Paulo")
        .format("DD/MM/YYYY HH:mm");

      const embed = new EmbedBuilder()
        .setColor("#FFD700")
        .setTitle(`⚔️ ${titulo}`)
        .setDescription("🛡️ **Evento Oficial da Guilda**")
        .addFields(
          { name: "📅 Data/Hora (BR)", value: `\`${dataBrasil}\``, inline: true },
          { name: "👥 Vagas", value: `0/${maxJogadores}`, inline: true },
          { name: "📜 Descrição", value: descricao },
          { name: "🎯 Participantes", value: "Nenhum ainda..." }
        )
        .setFooter({ text: "Albion Guild Event System • Profissional" })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("TANK")
          .setLabel("🛡️ TANK")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("HEALER")
          .setLabel("💚 HEALER")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("DPS")
          .setLabel("⚔️ DPS")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId("SUP")
          .setLabel("✨ SUP")
          .setStyle(ButtonStyle.Secondary)
      );

      const msg = await interaction.reply({
        embeds: [embed],
        components: [row],
        fetchReply: true
      });

      eventos.set(msg.id, {
        max: maxJogadores,
        participantes: []
      });
    }
  }

  // BOTÕES
  if (interaction.isButton()) {

    const evento = eventos.get(interaction.message.id);
    if (!evento) return;

    if (evento.participantes.length >= evento.max) {
      return interaction.reply({
        content: "❌ Evento lotado!",
        ephemeral: true
      });
    }

    if (evento.participantes.find(p => p.id === interaction.user.id)) {
      return interaction.reply({
        content: "⚠️ Você já está no evento!",
        ephemeral: true
      });
    }

    evento.participantes.push({
      id: interaction.user.id,
      nome: interaction.user.username,
      classe: interaction.customId
    });

    const lista = evento.participantes
      .map(p => `• ${p.nome} — ${p.classe}`)
      .join("\n");

    const embedAtualizado = EmbedBuilder.from(interaction.message.embeds[0])
      .spliceFields(1, 1, {
        name: "👥 Vagas",
        value: `${evento.participantes.length}/${evento.max}`,
        inline: true
      })
      .spliceFields(3, 1, {
        name: "🎯 Participantes",
        value: lista
      });

    await interaction.update({
      embeds: [embedAtualizado]
    });
  }

});

// =======================
// START PROFISSIONAL
// =======================
async function startBot() {
  try {
    console.log("🔄 Registrando comandos globais...");

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );

    console.log("✅ Comandos registrados!");

    await client.login(process.env.TOKEN);

    console.log("🔐 Login realizado com sucesso!");

  } catch (error) {
    console.error("❌ ERRO AO INICIAR BOT:", error);
  }
}

startBot();

// =======================
// ANTI-CRASH
// =======================
process.on("unhandledRejection", error => {
  console.error("❌ Erro não tratado:", error);
});

process.on("uncaughtException", error => {
  console.error("❌ Exceção não capturada:", error);
});

client.on("shardError", error => {
  console.error("❌ Erro de conexão:", error);
});
