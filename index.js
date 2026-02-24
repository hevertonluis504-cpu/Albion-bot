require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder
} = require("discord.js");

const { Player } = require("discord-player");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const player = new Player(client);

// =======================
// READY
// =======================
client.once("ready", async () => {
  console.log(`✅ Bot online como ${client.user.tag}`);
  await player.extractors.loadDefault();
});

// =======================
// INTERAÇÕES
// =======================
client.on("interactionCreate", async (interaction) => {

  if (!interaction.isChatInputCommand()) return;

  // =======================
  // COMANDO /CRIAR
  // =======================
  if (interaction.commandName === "criar") {

    const nome = interaction.options.getString("nome");

    const embed = new EmbedBuilder()
      .setTitle("Grupo Criado")
      .setDescription(`Grupo **${nome}** criado com sucesso!`)
      .setColor(0x00AEFF);

    return interaction.reply({ embeds: [embed] });
  }

  // =======================
  // COMANDO /DIVISAO
  // =======================
  if (interaction.commandName === "divisao") {

    const valor = interaction.options.getInteger("valor");
    const pessoas = interaction.options.getInteger("pessoas");

    if (pessoas === 0) {
      return interaction.reply("❌ Não pode dividir por zero!");
    }

    const resultado = (valor / pessoas).toFixed(2);

    return interaction.reply(`💰 Cada pessoa recebe: **${resultado}**`);
  }

  // =======================
  // COMANDO /TOCAR
  // =======================
  if (interaction.commandName === "tocar") {

    await interaction.deferReply();

    const voiceChannel = interaction.member?.voice?.channel;

    if (!voiceChannel) {
      return interaction.editReply("❌ Você precisa estar em um canal de voz!");
    }

    const musica = interaction.options.getString("musica");

    try {

      const { track } = await player.play(voiceChannel, musica, {
        nodeOptions: {
          metadata: {
            channel: interaction.channel,
            requestedBy: interaction.user
          }
        }
      });

      const embed = new EmbedBuilder()
        .setTitle("🎵 Tocando agora")
        .setDescription(`[${track.title}](${track.url})`)
        .setThumbnail(track.thumbnail)
        .setColor(0x00ff00);

      return interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error(error);
      return interaction.editReply("❌ Não consegui tocar essa música!");
    }
  }

});

client.login(process.env.DISCORD_TOKEN);

client.once('clientReady', async () => {const { SlashCommandBuilder, REST, Routes } = require("discord.js");

const commands = [

  new SlashCommandBuilder()
    .setName("criar")
    .setDescription("Criar grupo de conteúdo")
    .addStringOption(o=>o.setName("tipo").setDescription("Tipo do conteúdo").setRequired(true))
    .addIntegerOption(o=>o.setName("jogadores").setDescription("Total de jogadores").setRequired(true))
    .addStringOption(o=>o.setName("classes").setDescription("Ex: 1 Tank, 2 Healer, 3 DPS").setRequired(true))
    .addStringOption(o=>o.setName("data").setDescription("DD/MM/AAAA").setRequired(true))
    .addStringOption(o=>o.setName("horario").setDescription("HH:MM UTC-3").setRequired(true))
    .addStringOption(o=>o.setName("descricao").setDescription("Descrição")),

  new SlashCommandBuilder()
    .setName("divisao")
    .setDescription("Dividir valor entre jogadores")
    .addIntegerOption(o=>o.setName("valor").setDescription("Valor total").setRequired(true))
    .addIntegerOption(o=>o.setName("pessoas").setDescription("Quantidade de pessoas").setRequired(true)),

  new SlashCommandBuilder()
    .setName("tocar")
    .setDescription("Tocar música no canal de voz")
    .addStringOption(o=>o.setName("musica").setDescription("Nome ou link da música").setRequired(true))

].map(c=>c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

const app = await rest.get(Routes.oauth2CurrentApplication());

await rest.put(
  Routes.applicationCommands(app.id),
  { body: commands }
);

console.log("Comandos registrados automaticamente!");
