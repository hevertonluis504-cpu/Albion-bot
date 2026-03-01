require("dotenv").config();
const fs = require("fs").promises;
const http = require("http");

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

/* ===================== PROTEÇÃO ANTI-CRASH ===================== */
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

/* ===================== CLIENT ===================== */
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const groups = new Map();

/* ===================== FUNÇÕES ===================== */

function createBrazilDate(dateStr, timeStr) {
  const [d, m, y] = dateStr.split("/").map(Number);
  const [h, min] = timeStr.split(":").map(Number);
  const date = new Date(y, m - 1, d, h, min);
  if (isNaN(date.getTime()) || date < new Date()) return false;
  return date;
}

function parseRoles(input) {
  const roles = {};
  let total = 0;

  input.split(",").forEach(p => {
    const match = p.trim().match(/^(\d+)\s+(.+)$/);
    if (match) {
      const qty = parseInt(match[1]);
      const name = match[2];
      roles[name] = { name, limit: qty };
      total += qty;
    }
  });

  return { roles, total };
}

function getRoleEmoji(name) {
  const n = name.toLowerCase();
  if (n.includes("tank")) return "🛡️";
  if (n.includes("heal")) return "💚";
  if (n.includes("dps")) return "⚔️";
  if (n.includes("debuff")) return "🌀";
  return "🔹";
}

function progressBar(current, total) {
  const max = 10;
  const filled = Math.round((current / total) * max);
  return "🟢".repeat(filled) + "⚪".repeat(max - filled);
}

function buildEmbed(group) {
  const embed = new EmbedBuilder()
    .setTitle(`⚔️ ${group.title}`)
    .setColor(group.closed ? 0xe74c3c : 0x3498db)
    .setDescription(
      `📅 <t:${Math.floor(group.startDate.getTime()/1000)}:F>\n` +
      `⏳ <t:${Math.floor(group.startDate.getTime()/1000)}:R>\n\n` +
      `📝 **Descrição:**\n${group.descricao}\n\n` +
      `👥 Total: ${group.total}\n` +
      `📌 Status: ${group.closed ? "Encerrado" : "Aberto"}`
    );

  for (const r in group.roles) {
    const list = group.members[r] || [];
    embed.addFields({
      name: `${getRoleEmoji(r)} ${r}`,
      value:
        `${progressBar(list.length, group.roles[r].limit)} (${list.length}/${group.roles[r].limit})\n\n` +
        (list.length ? list.map(u => `<@${u}>`).join("\n") : "—"),
      inline: true
    });
  }

  return embed;
}

function buildButtons(group, msgId) {
  if (group.closed) return [];

  const rows = [];
  let row = new ActionRowBuilder();

  for (const r in group.roles) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`join_${msgId}_${r}`)
        .setLabel(r)
        .setStyle(ButtonStyle.Primary)
    );

    if (row.components.length === 5) {
      rows.push(row);
      row = new ActionRowBuilder();
    }
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

  rows.push(row);
  return rows;
}

/* ===================== READY ===================== */

client.once(Events.ClientReady, async () => {
  console.log("🤖 Bot online!");

  const commands = [
    new SlashCommandBuilder()
      .setName("criar")
      .setDescription("Criar evento")
      .addStringOption(o => o.setName("tipo").setDescription("Tipo").setRequired(true))
      .addIntegerOption(o => o.setName("jogadores").setDescription("Total jogadores").setRequired(true))
      .addStringOption(o => o.setName("classes").setDescription("Ex: 1 Tank, 1 Healer, 3 DPS").setRequired(true))
      .addStringOption(o => o.setName("data").setDescription("DD/MM/AAAA").setRequired(true))
      .addStringOption(o => o.setName("horario").setDescription("HH:MM").setRequired(true))
      .addStringOption(o => o.setName("descricao").setDescription("Descrição").setRequired(false))
  ].map(c => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  await rest.put(
    Routes.applicationCommands(client.user.id),
    { body: commands }
  );

  console.log("✅ Slash commands registrados");
});

/* ===================== INTERAÇÕES ===================== */

client.on("interactionCreate", async i => {

  if (i.isChatInputCommand()) {

    if (i.commandName === "criar") {

      const parsed = parseRoles(i.options.getString("classes"));
      if (parsed.total !== i.options.getInteger("jogadores"))
        return i.reply({ content: "❌ Soma das classes diferente do total.", ephemeral: true });

      const date = createBrazilDate(
        i.options.getString("data"),
        i.options.getString("horario")
      );

      if (!date)
        return i.reply({ content: "❌ Data ou horário inválido.", ephemeral: true });

      const members = {};
      for (const r in parsed.roles) members[r] = [];

      const group = {
        title: i.options.getString("tipo"),
        total: i.options.getInteger("jogadores"),
        roles: parsed.roles,
        members,
        startDate: date,
        channelId: i.channelId,
        creator: i.user.id,
        closed: false,
        descricao: i.options.getString("descricao") || "Sem descrição."
      };

      await i.deferReply();

      await i.editReply({
        embeds: [buildEmbed(group)],
        components: []
      });

      const msg = await i.fetchReply(); // ✅ CORREÇÃO

      groups.set(msg.id, group);

      await i.editReply({
        embeds: [buildEmbed(group)],
        components: buildButtons(group, msg.id)
      });
    }
  }

  if (i.isButton()) {
    await i.deferUpdate();

    const [action, msgId, role] = i.customId.split("_");
    const group = groups.get(msgId);
    if (!group) return;

    if (action === "join") {
      for (const r in group.members)
        group.members[r] = group.members[r].filter(id => id !== i.user.id);

      if (group.members[role].length < group.roles[role].limit)
        group.members[role].push(i.user.id);
    }

    if (action === "leave") {
      for (const r in group.members)
        group.members[r] = group.members[r].filter(id => id !== i.user.id);
    }

    if (action === "close" && i.user.id === group.creator) {
      group.closed = true;
    }

    const channel = await client.channels.fetch(group.channelId);
    const msg = await channel.messages.fetch(msgId);

    await msg.edit({
      embeds: [buildEmbed(group)],
      components: buildButtons(group, msgId)
    });
  }
});

/* ===================== LOGIN ===================== */

if (!process.env.DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN não definido!");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN)
  .then(() => console.log("🔐 Conectando ao Discord..."))
  .catch(console.error);

/* ===================== KEEP ALIVE RENDER ===================== */

const port = process.env.PORT || 10000;

http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Bot online");
}).listen(port, "0.0.0.0", () => {
  console.log("🌐 HTTP ativo na porta", port);
});
