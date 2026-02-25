require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  SlashCommandBuilder,
  REST,
  Routes
} = require("discord.js");

const { Player } = require("discord-player");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const player = new Player(client);

// ======================
// BOT READY
// ======================
client.once("clientReady", async () => {
  console.log(`✅ Bot online como ${client.user.tag}`);

  await player.extractors.loadDefault();

  // ===== REGISTRAR COMANDOS AUTOMATICAMENTE =====
  const commands = [

    new SlashCommandBuilder()
      .setName("criar")
      .setDescription("Criar grupo de conteúdo")
      .addStringOption(o=>o.setName("tipo").setDescription("Tipo").setRequired(true))
      .addIntegerOption(o=>o.setName("jogadores").setDescription("Total").setRequired(true))
      .addStringOption(o=>o.setName("classes").setDescription("Classes").setRequired(true))
      .addStringOption(o=>o.setName("data").setDescription("Data").setRequired(true))
      .addStringOption(o=>o.setName("horario").setDescription("Horário").setRequired(true))
      .addStringOption(o=>o.setName("descricao").setDescription("Descrição")),

    new SlashCommandBuilder()
      .setName("divisao")
      .setDescription("Dividir valor")
      .addIntegerOption(o=>o.setName("valor").setDescription("Valor total").setRequired(true))
      .addIntegerOption(o=>o.setName("pessoas").setDescription("Quantidade").setRequired(true)),

    new SlashCommandBuilder()
      .setName("tocar")
      .setDescription("Tocar música")
      .addStringOption(o=>o.setName("musica").setDescription("Nome ou link").setRequired(true))

  ].map(c => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  const app = await rest.get(Routes.oauth2CurrentApplication());

  await rest.put(
    Routes.applicationCommands(app.id),
    { body: commands }
  );

  console.log("✅ Comandos registrados!");
});

// ======================
// INTERAÇÕES
// ======================
client.on("interactionCreate", async (interaction) => {

  if (!interaction.isChatInputCommand()) return;

  // CRIAR
  if (interaction.commandName === "criar") {
    return interaction.reply("Grupo criado com sucesso!");
  }

  // DIVISAO
  if (interaction.commandName === "divisao") {
    const valor = interaction.options.getInteger("valor");
    const pessoas = interaction.options.getInteger("pessoas");

    if (pessoas === 0) {
      return interaction.reply("❌ Não pode dividir por zero!");
    }

    const resultado = (valor / pessoas).toFixed(2);
    return interaction.reply(`💰 Cada pessoa recebe: ${resultado}`);
  }

  // TOCAR
  if (interaction.commandName === "tocar") {

    await interaction.deferReply();

    const voiceChannel = interaction.member.voice.channel;

    if (!voiceChannel) {
      return interaction.editReply("❌ Entre em um canal de voz!");
    }

    const musica = interaction.options.getString("musica");

    try {
      const { track } = await player.play(voiceChannel, musica);

      return interaction.editReply(`🎵 Tocando: ${track.title}`);

    } catch (err) {
      console.log(err);
      return interaction.editReply("Erro ao tocar música.");
    }
  }

});

player.events.on("error", (queue, error) => {
  console.log(error);
});

client.login(process.env.DISCORD_TOKEN);
