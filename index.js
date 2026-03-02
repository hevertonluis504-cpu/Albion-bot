
require("dotenv").config();
const { 
  Client, 
  GatewayIntentBits, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  EmbedBuilder, 
  REST, 
  Routes, 
  SlashCommandBuilder, 
  Events 
} = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const groups = new Map();

// ================= UTILIDADES =================

function getRoleEmoji(name) {
  const n = name.toLowerCase();
  if (n.includes("tank")) return "🛡️";
  if (n.includes("heal")) return "💚";
  if (n.includes("dps")) return "⚔️";
  return "✨";
}

function progressBar(current, total) {
  const size = 8;
  const filled = Math.round((current / total) * size);
  return "🟢".repeat(filled) + "⚪".repeat(size - filled);
}

function parseRoles(input) {
  const roles = {};
  let total = 0;
  input.split(",").forEach(r => {
    const match = r.trim().match(/^(\d+)\s+(.+)$/);
    if (match) {
      const qty = parseInt(match[1]);
      const name = match[2];
      roles[name] = { limit: qty };
      total += qty;
    }
  });
  return { roles, total };
}

function buildEmbed(group) {
  const embed = new EmbedBuilder()
    .setTitle(`⚔️ ${group.title}`)
    .setColor(0x00bfff)
    .setDescription(
      `📝 **Descrição:** ${group.description}\n\n` +
      `🇧🇷 **Horário (Brasil):** <t:${Math.floor(group.startDate/1000)}:F>\n` +
      `⏳ Começa <t:${Math.floor(group.startDate/1000)}:R>\n\n` +
      `👥 Total: ${group.total}\n` +
      `📌 Status: ${group.closed ? "Encerrado 🔒" : "Aberto 🟢"}`
    );

  for (const role in group.roles) {
    const members = group.members[role] || [];
    embed.addFields({
      name: `${getRoleEmoji(role)} ${role}`,
      value: `${progressBar(members.length, group.roles[role].limit)} (${members.length}/${group.roles[role].limit})\n` +
             (members.length ? members.map(id => `<@${id}>`).join("\n") : "—"),
      inline: true
    });
  }

  return embed;
}

function buildButtons(group, msgId) {
  if (group.closed) return [];

  const row = new ActionRowBuilder();

  for (const role in group.roles) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`join_${msgId}_${role}`)
        .setLabel(role)
        .setStyle(ButtonStyle.Primary)
    );
  }

  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`leave_${msgId}`)
      .setLabel("Sair")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`close_${msgId}`)
      .setLabel("Encerrar")
      .setStyle(ButtonStyle.Secondary)
  );

  return [row];
}

// ================= READY =================

client.once(Events.ClientReady, async () => {
  console.log(`🤖 Conectado como ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName("criar")
      .setDescription("Criar evento")
      .addStringOption(o => o.setName("tipo").setDescription("Nome do evento").setRequired(true))
      .addStringOption(o => o.setName("descricao").setDescription("Descrição do evento").setRequired(true))
      .addIntegerOption(o => o.setName("jogadores").setDescription("Total de jogadores").setRequired(true))
      .addStringOption(o => o.setName("classes").setDescription("Ex: 1 Tank, 1 Healer, 3 DPS").setRequired(true))
      .addStringOption(o => o.setName("data").setDescription("Formato: DD/MM/AAAA").setRequired(true))
      .addStringOption(o => o.setName("horario").setDescription("Formato: HH:MM (Brasil)").setRequired(true))
  ].map(c => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(
    Routes.applicationCommands(client.user.id),
    { body: commands }
  );

  console.log("✅ Slash command registrado");
});

// ================= INTERAÇÕES =================

client.on("interactionCreate", async interaction => {

  if (interaction.isChatInputCommand()) {

    if (interaction.commandName === "criar") {

      const parsed = parseRoles(interaction.options.getString("classes"));
      if (parsed.total !== interaction.options.getInteger("jogadores"))
        return interaction.reply({ content: "❌ Soma das classes diferente do total.", ephemeral: true });

      const dateStr = interaction.options.getString("data");
      const timeStr = interaction.options.getString("horario");
      const [d,m,y] = dateStr.split("/").map(Number);
      const [h,min] = timeStr.split(":").map(Number);

      // Força horário Brasil
      const date = new Date(Date.UTC(y, m-1, d, h+3, min)); 

      if (isNaN(date.getTime()))
        return interaction.reply({ content: "❌ Data inválida.", ephemeral: true });

      const members = {};
      for (const r in parsed.roles) members[r] = [];

      const group = {
        title: interaction.options.getString("tipo"),
        description: interaction.options.getString("descricao"),
        total: interaction.options.getInteger("jogadores"),
        roles: parsed.roles,
        members,
        startDate: date.getTime(),
        creator: interaction.user.id,
        closed: false
      };

      await interaction.deferReply();
      await interaction.editReply({ embeds: [buildEmbed(group)] });
      const msg = await interaction.fetchReply();

      groups.set(msg.id, group);

      await interaction.editReply({
        embeds: [buildEmbed(group)],
        components: buildButtons(group, msg.id)
      });
    }
  }

  if (interaction.isButton()) {
    await interaction.deferUpdate();
    const [action, msgId, role] = interaction.customId.split("_");
    const group = groups.get(msgId);
    if (!group) return;

    if (action === "join") {
      for (const r in group.members)
        group.members[r] = group.members[r].filter(id => id !== interaction.user.id);
      if (group.members[role].length < group.roles[role].limit)
        group.members[role].push(interaction.user.id);
    }

    if (action === "leave") {
      for (const r in group.members)
        group.members[r] = group.members[r].filter(id => id !== interaction.user.id);
    }

    if (action === "close" && interaction.user.id === group.creator) {
      group.closed = true;
    }

    const channel = await interaction.channel;
    const msg = await channel.messages.fetch(msgId);

    await msg.edit({
      embeds: [buildEmbed(group)],
      components: buildButtons(group, msgId)
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
