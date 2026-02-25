require("dotenv").config();
const fs = require("fs-extra");
const path = "./groups.json";

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  REST,
  Routes
} = require("discord.js");

const { Player } = require("discord-player");
const Youtubei = require("discord-player-youtubei").default;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const player = new Player(client);

let groups = {};
if (fs.existsSync(path)) {
  groups = fs.readJsonSync(path);
}

// ================= READY =================
client.once("clientReady", async () => {
  console.log(`✅ Bot online como ${client.user.tag}`);

  await player.extractors.loadDefault();
  await player.extractors.register(Youtubei);

  const commands = [
    new SlashCommandBuilder()
      .setName("criar")
      .setDescription("Criar grupo Albion")
      .addStringOption(o=>o.setName("tipo").setDescription("Tipo").setRequired(true))
      .addIntegerOption(o=>o.setName("jogadores").setDescription("Quantidade total").setRequired(true))
      .addStringOption(o=>o.setName("data").setDescription("DD/MM").setRequired(true))
      .addStringOption(o=>o.setName("hora").setDescription("HH:MM").setRequired(true))
      .addStringOption(o=>o.setName("descricao").setDescription("Descrição").setRequired(true)),

    new SlashCommandBuilder()
      .setName("divisao")
      .setDescription("Dividir loot")
      .addIntegerOption(o=>o.setName("valor").setDescription("Valor total").setRequired(true))
      .addStringOption(o=>o.setName("jogadores").setDescription("Mencione todos separados por espaço").setRequired(true)),

    new SlashCommandBuilder()
      .setName("tocar")
      .setDescription("Tocar música")
      .addStringOption(o=>o.setName("musica").setDescription("Nome ou link").setRequired(true)),

    new SlashCommandBuilder()
      .setName("parar")
      .setDescription("Parar música"),

    new SlashCommandBuilder()
      .setName("fila")
      .setDescription("Ver fila")
  ].map(c=>c.toJSON());

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  const app = await rest.get(Routes.oauth2CurrentApplication());
  await rest.put(Routes.applicationCommands(app.id), { body: commands });

  console.log("✅ Comandos registrados");
});

// ================= INTERAÇÕES =================
client.on("interactionCreate", async (interaction) => {

  // ===== COMANDOS =====
  if (interaction.isChatInputCommand()) {

    // CRIAR GRUPO
    if (interaction.commandName === "criar") {

      const tipo = interaction.options.getString("tipo");
      const total = interaction.options.getInteger("jogadores");
      const data = interaction.options.getString("data");
      const hora = interaction.options.getString("hora");
      const descricao = interaction.options.getString("descricao");

      groups[interaction.guildId] = {
        tipo,
        total,
        data,
        hora,
        descricao,
        players: []
      };

      fs.writeJsonSync(path, groups);

      const embed = new EmbedBuilder()
        .setTitle(`📌 Grupo - ${tipo}`)
        .setDescription(descricao)
        .addFields(
          { name: "📅 Data", value: data, inline: true },
          { name: "⏰ Hora", value: hora, inline: true },
          { name: "👥 Jogadores", value: `0/${total}` },
          { name: "🎭 Classes", value: "🛡️ Tank\n💚 Healer\n⚔️ DPS\n🏹 Ranged\n🧙 Mage" }
        )
        .setColor("Green");

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("entrar").setLabel("Entrar").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("sair").setLabel("Sair").setStyle(ButtonStyle.Danger)
      );

      await interaction.reply({ embeds: [embed], components: [row] });
    }

    // DIVISAO
    if (interaction.commandName === "divisao") {

      const valor = interaction.options.getInteger("valor");
      const jogadores = interaction.options.getString("jogadores").match(/<@!?\d+>/g);

      if (!jogadores) return interaction.reply("❌ Mencione jogadores válidos.");

      const total = jogadores.length;
      const resultado = (valor / total).toFixed(2);

      const embed = new EmbedBuilder()
        .setTitle("💰 Divisão de Loot")
        .setDescription(`Valor total: ${valor}`)
        .addFields(
          { name: "👥 Jogadores", value: jogadores.join("\n") },
          { name: "💎 Cada um recebe", value: `${resultado}` }
        )
        .setColor("Gold");

      await interaction.reply({ embeds: [embed] });
    }

    // TOCAR
    if (interaction.commandName === "tocar") {

      await interaction.deferReply();
      const canal = interaction.member.voice.channel;

      if (!canal) return interaction.editReply("❌ Entre em um canal de voz.");

      const musica = interaction.options.getString("musica");

      try {
        const { track } = await player.play(canal, musica);
        interaction.editReply(`🎵 Tocando: ${track.title}`);
      } catch {
        interaction.editReply("❌ Erro ao tocar música.");
      }
    }

    if (interaction.commandName === "parar") {
      player.nodes.delete(interaction.guildId);
      interaction.reply("⏹ Música parada.");
    }

    if (interaction.commandName === "fila") {
      const queue = player.nodes.get(interaction.guildId);
      if (!queue || !queue.currentTrack) return interaction.reply("Fila vazia.");
      interaction.reply(`🎵 Tocando: ${queue.currentTrack.title}`);
    }
  }

  // ===== BOTÕES =====
  if (interaction.isButton()) {

    const group = groups[interaction.guildId];
    if (!group) return interaction.reply({ content: "Grupo não encontrado.", ephemeral: true });

    if (interaction.customId === "entrar") {

      if (group.players.includes(interaction.user.id))
        return interaction.reply({ content: "Você já está no grupo.", ephemeral: true });

      if (group.players.length >= group.total)
        return interaction.reply({ content: "Grupo cheio.", ephemeral: true });

      group.players.push(interaction.user.id);
    }

    if (interaction.customId === "sair") {
      group.players = group.players.filter(id => id !== interaction.user.id);
    }

    fs.writeJsonSync(path, groups);

    const embed = new EmbedBuilder()
      .setTitle(`📌 Grupo - ${group.tipo}`)
      .setDescription(group.descricao)
      .addFields(
        { name: "📅 Data", value: group.data, inline: true },
        { name: "⏰ Hora", value: group.hora, inline: true },
        { name: "👥 Jogadores", value: `${group.players.length}/${group.total}\n${group.players.map(id=>`<@${id}>`).join("\n") || "Nenhum"}` },
        { name: "🎭 Classes", value: "🛡️ Tank\n💚 Healer\n⚔️ DPS\n🏹 Ranged\n🧙 Mage" }
      )
      .setColor("Green");

    await interaction.update({ embeds: [embed] });
  }

});

client.login(process.env.DISCORD_TOKEN);
