require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
  REST,
  Routes
} = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// Armazenamento temporário em memória
const eventos = new Map();

// Classes
const classes = [
  { id: "tank", nome: "🛡️ TANK" },
  { id: "healer", nome: "💚 HEALER" },
  { id: "dps", nome: "⚔️ DPS" },
  { id: "sup", nome: "✨ SUP" }
];

// Criar embed
function criarEmbed(evento) {

  const dataBrasil = new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo"
  });

  let lista = "";

  classes.forEach(c => {
    const membros = Object.entries(evento.participantes)
      .filter(([_, classe]) => classe === c.id)
      .map(([id]) => `<@${id}>`);

    lista += `**${c.nome}**\n`;
    lista += membros.length ? membros.join("\n") : "—";
    lista += "\n\n";
  });

  const total = Object.keys(evento.participantes).length;

  return new EmbedBuilder()
    .setTitle(`⚔️ ${evento.titulo}`)
    .setColor("Orange")
    .addFields(
      { name: "📅 Data/Hora (Brasília)", value: dataBrasil },
      { name: "👥 Jogadores", value: `${total}/${evento.limite}` },
      { name: "📝 Descrição", value: evento.descricao },
      { name: "📋 Participantes", value: lista }
    )
    .setFooter({ text: "Sistema de Eventos - Albion Guild" });
}

// Ready
client.once("ready", async () => {

  console.log(`🔥 Online como ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName("evento")
      .setDescription("Criar evento da guilda")
      .addStringOption(o =>
        o.setName("titulo").setDescription("Título").setRequired(true))
      .addIntegerOption(o =>
        o.setName("jogadores").setDescription("Limite total").setRequired(true))
      .addStringOption(o =>
        o.setName("descricao").setDescription("Descrição").setRequired(true))
  ].map(c => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID),
    { body: commands }
  );

  console.log("✅ Comando global registrado (pode demorar até 1h)");
});

// Interações
client.on(Events.InteractionCreate, async interaction => {

  if (interaction.isChatInputCommand()) {

    const eventId = Date.now().toString();

    eventos.set(eventId, {
      titulo: interaction.options.getString("titulo"),
      limite: interaction.options.getInteger("jogadores"),
      descricao: interaction.options.getString("descricao"),
      participantes: {}
    });

    const embed = criarEmbed(eventos.get(eventId));

    const row = new ActionRowBuilder();
    classes.forEach(c => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`classe_${c.id}_${eventId}`)
          .setLabel(c.nome)
          .setStyle(ButtonStyle.Primary)
      );
    });

    await interaction.reply({
      embeds: [embed],
      components: [row]
    });
  }

  if (interaction.isButton()) {

    if (!interaction.customId.startsWith("classe_")) return;

    const [, classeId, eventId] = interaction.customId.split("_");
    const evento = eventos.get(eventId);
    if (!evento) return;

    const userId = interaction.user.id;
    const total = Object.keys(evento.participantes).length;

    if (evento.participantes[userId]) {

      if (evento.participantes[userId] === classeId) {
        delete evento.participantes[userId];
        await interaction.reply({ content: "❌ Saiu do evento.", ephemeral: true });
      } else {
        evento.participantes[userId] = classeId;
        await interaction.reply({ content: "🔄 Classe alterada.", ephemeral: true });
      }

    } else {

      if (total >= evento.limite) {
        return interaction.reply({ content: "🚫 Evento lotado!", ephemeral: true });
      }

      evento.participantes[userId] = classeId;
      await interaction.reply({ content: "✅ Entrou no evento!", ephemeral: true });
    }

    await interaction.message.edit({
      embeds: [criarEmbed(evento)]
    });
  }
});

client.login(process.env.TOKEN);
