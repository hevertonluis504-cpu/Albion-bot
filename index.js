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
  Events,
  ChannelType,
  PermissionFlagsBits
} = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const groups = new Map();
const rankingFile = "./ranking.json";

/* ======================= RANKING ======================= */

async function loadRanking() {
  try {
    return JSON.parse(await fs.readFile(rankingFile, "utf8"));
  } catch {
    return {};
  }
}

async function saveRanking(data) {
  await fs.writeFile(rankingFile, JSON.stringify(data, null, 2));
}

async function addPoints(users) {
  const ranking = await loadRanking();
  for (const id of users) {
    ranking[id] = (ranking[id] || 0) + 1;
  }
  await saveRanking(ranking);
}

/* ======================= LOGS ======================= */

async function getLogChannel(guild) {
  let channel = guild.channels.cache.find(c => c.name === "logs-bot");
  if (!channel) {
    channel = await guild.channels.create({
      name: "logs-bot",
      type: ChannelType.GuildText,
      permissionOverwrites: [
        {
          id: guild.roles.everyone,
          allow: [PermissionFlagsBits.ViewChannel],
        }
      ]
    });
  }
  return channel;
}

/* ======================= SALVAR / CARREGAR ======================= */

async function saveGroups() {
  const data = Object.fromEntries(groups);
  await fs.writeFile("./groups.json", JSON.stringify(data, null, 2));
}

async function loadGroups() {
  try {
    const data = JSON.parse(await fs.readFile("./groups.json", "utf8"));
    for (const id in data) {
      data[id].startDate = new Date(data[id].startDate);
      groups.set(id, data[id]);
    }
  } catch {}
}

/* ======================= VALIDAÇÕES ======================= */

function createBrazilDate(dateStr, timeStr) {
  const [d, m, y] = dateStr.split("/").map(Number);
  const [h, min] = timeStr.split(":").map(Number);

  const date = new Date(Date.UTC(y, m - 1, d, h + 3, min));

  if (isNaN(date.getTime())) return false;
  if (date < new Date()) return false;

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

function formatDate(d) {
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function formatTime(d) {
  return d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo"
  });
}

/* ======================= EMBED PROFISSIONAL ======================= */

function getRoleEmoji(name) {
  const n = name.toLowerCase();

  if (n.includes("tank")) return "🛡️";
  if (n.includes("heal")) return "💚";
  if (n.includes("dps")) return "⚔️";
  if (n.includes("arc")) return "🏹";
  if (n.includes("debuff")) return "🌀";
  if (n.includes("suporte")) return "✨";

  return "🔹";
}

function progressBar(current, total) {
  const filled = "🟢".repeat(current);
  const empty = "⚪".repeat(Math.max(total - current, 0));
  return filled + empty;
}

function buildEmbed(group) {
  const now = new Date();
  const diff = group.startDate - now;

  let color = 0x3498db;
  let status = "Aberto";

  if (group.closed) {
    color = 0xe74c3c;
    status = "Encerrado";
  } else if (diff <= 0) {
    color = 0x2ecc71;
    status = "Iniciado";
  } else if (diff <= 10 * 60 * 1000) {
    color = 0xf1c40f;
    status = "Começando em breve";
  }

  const embed = new EmbedBuilder()
    .setTitle(`⚔️ ${group.title}`)
    .setColor(color)
    .setDescription(
      `📅 <t:${Math.floor(group.startDate.getTime() / 1000)}:F>\n` +
      `⏳ <t:${Math.floor(group.startDate.getTime() / 1000)}:R>\n\n` +
      `👥 Total: ${group.total}\n` +
      `📌 Status: ${status}`
    )
    .setFooter({ text: "Sistema Guild PRO" });

  for (const r in group.roles) {
    const role = group.roles[r];
    const membersList = group.members[r] || [];
    const emoji = getRoleEmoji(role.name);

    embed.addFields({
      name: `${emoji} ${role.name}`,
      value:
        `${progressBar(membersList.length, role.limit)} (${membersList.length}/${role.limit})\n\n` +
        (membersList.length
          ? membersList.map(u => `<@${u}>`).join("\n")
          : "—"),
      inline: true
    });
  }

  return embed;
}
/* ======================= BOTÕES ======================= */

function buildButtons(group, msgId) {
  if (group.closed) return [];

  const rows = [];
  const all = [];
  const started = group.startDate <= new Date();

  for (const r in group.roles) {
    all.push(
      new ButtonBuilder()
        .setCustomId(`join_${msgId}_${r}`)
        .setLabel(r)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(started)
    );
  }

  all.push(
    new ButtonBuilder()
      .setCustomId(`leave_${msgId}`)
      .setLabel("Sair")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(started),

    new ButtonBuilder()
      .setCustomId(`close_${msgId}`)
      .setLabel("Encerrar Evento")
      .setStyle(ButtonStyle.Secondary)
  );

  let row = new ActionRowBuilder();
  for (const b of all) {
    if (row.components.length === 5) {
      rows.push(row);
      row = new ActionRowBuilder();
    }
    row.addComponents(b);
  }

  if (row.components.length) rows.push(row);
  return rows;
}

/* ======================= READY ======================= */

client.once(Events.ClientReady, async () => {
  console.log("Bot PRO online!");
  await loadGroups();

  const commands = [
    new SlashCommandBuilder()
      .setName("criar")
      .setDescription("Criar evento de grupo")
      .addStringOption(o =>
        o.setName("tipo")
          .setDescription("Tipo do evento")
          .setRequired(true)
      )
      .addIntegerOption(o =>
        o.setName("jogadores")
          .setDescription("Total de jogadores")
          .setRequired(true)
      )
      .addStringOption(o =>
        o.setName("classes")
          .setDescription("Ex: 1 Tank, 1 Healer, 3 DPS")
          .setRequired(true)
      )
      .addStringOption(o =>
        o.setName("data")
          .setDescription("DD/MM/AAAA")
          .setRequired(true)
      )
      .addStringOption(o =>
        o.setName("horario")
          .setDescription("HH:MM")
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName("ranking")
      .setDescription("Ver ranking da guilda")
  ].map(c => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
});

/* ======================= INTERAÇÕES ======================= */

client.on("interactionCreate", async i => {

  if (i.isChatInputCommand()) {

    if (i.commandName === "criar") {

      const parsed = parseRoles(i.options.getString("classes"));
      if (parsed.total !== i.options.getInteger("jogadores"))
        return i.reply({ content: "❌ Soma das classes diferente do total.", ephemeral: true });

      const validDate = createBrazilDate(
        i.options.getString("data"),
        i.options.getString("horario")
      );

      if (!validDate)
        return i.reply({ content: "❌ Data ou horário inválido.", ephemeral: true });

      const members = {};
      for (const r in parsed.roles) members[r] = [];

      const group = {
        title: i.options.getString("tipo"),
        total: i.options.getInteger("jogadores"),
        roles: parsed.roles,
        members,
        startDate: validDate,
        channelId: i.channelId,
        creator: i.user.id,
        closed: false,
        pinged: false
      };

      const msg = await i.reply({
        embeds: [buildEmbed(group)],
        fetchReply: true
      });

      groups.set(msg.id, group);
      await msg.edit({ components: buildButtons(group, msg.id) });
      await saveGroups();

      const logChannel = await getLogChannel(i.guild);
      logChannel.send(`📌 Evento criado por <@${i.user.id}>`);
    }

    if (i.commandName === "ranking") {
      const ranking = await loadRanking();
      const sorted = Object.entries(ranking)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      if (!sorted.length)
        return i.reply("Nenhum ponto registrado ainda.");

      const text = sorted
        .map((r, index) => `**${index + 1}.** <@${r[0]}> — ${r[1]} participações`)
        .join("\n");

      i.reply({ content: `🏆 Ranking da Guilda\n\n${text}` });
    }
  }

  if (i.isButton()) {
    await i.deferUpdate();

    const [action, msgId, role] = i.customId.split("_");
    const group = groups.get(msgId);
    if (!group || group.closed) return;

    const channel = await client.channels.fetch(i.channelId);
    const msg = await channel.messages.fetch(msgId);

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

    if (action === "close") {
      if (i.user.id !== group.creator) return;

      group.closed = true;

      const participants = [];
      for (const r in group.members)
        group.members[r].forEach(id => participants.push(id));

      await addPoints(participants);

      const logChannel = await getLogChannel(i.guild);
      logChannel.send(`🛑 Evento encerrado por <@${i.user.id}>`);

      await msg.edit({
        embeds: [buildEmbed(group)],
        components: []
      });

      await saveGroups();
      return;
    }

    await msg.edit({
      embeds: [buildEmbed(group)],
      components: buildButtons(group, msgId)
    });

    await saveGroups();
  }
});

/* ======================= SISTEMA AUTOMÁTICO ======================= */

setInterval(async () => {
  for (const [msgId, group] of groups.entries()) {
    if (group.closed) continue;

    const now = new Date();
    const diff = group.startDate - now;

    try {
      const channel = await client.channels.fetch(group.channelId);
      const msg = await channel.messages.fetch(msgId);

      if (diff <= 5 * 60 * 1000 && diff > 0 && !group.pinged) {
        channel.send("⚠️ Evento começa em 5 minutos!");
        group.pinged = true;
      }

      if (diff <= 0) {
        await msg.edit({
          embeds: [buildEmbed(group)],
          components: buildButtons(group, msgId)
        });
      }

    } catch {}
  }
}, 30000);

/* ======================= LOGIN ======================= */

client.login(process.env.DISCORD_TOKEN);

/* ======================= HTTP RENDER ======================= */

const port = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.end("Bot PRO online");
}).listen(port);
