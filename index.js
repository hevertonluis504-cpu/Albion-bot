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

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const groups = new Map();

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

/* ======================= LIMPAR BOTÕES ANTIGOS ======================= */

async function limparBotoesAntigos() {
  for (const [msgId, group] of groups.entries()) {
    try {
      const channel = await client.channels.fetch(group.channelId);
      const msg = await channel.messages.fetch(msgId);
      await msg.edit({ components: [] });
    } catch {}
  }
}

/* ======================= UTIL ======================= */

function parseRoles(input) {
  const roles = {};
  input.split(",").forEach(p => {
    const match = p.trim().match(/^(\d+)\s+(.+)$/);
    if (match) {
      roles[match[2]] = {
        name: match[2],
        limit: parseInt(match[1])
      };
    }
  });
  return roles;
}

function parseDateTime(dateStr, timeStr) {
  const [d, m, y] = dateStr.split("/").map(Number);
  const [h, min] = timeStr.split(":").map(Number);
  return new Date(y, m - 1, d, h, min);
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

/* ======================= EMBED ======================= */

function buildEmbed(group) {
  const now = new Date();
  const embed = new EmbedBuilder()
    .setTitle(`⚔️ ${group.title}`)
    .setColor(0x5865F2)
    .setDescription(
      `📅 ${formatDate(group.startDate)}\n` +
      `🕒 ${formatTime(group.startDate)} UTC-3\n\n` +
      `👥 Total: ${group.total}`
    );

  const diff = group.startDate - now;

  if (diff > 0) {
    const h = Math.floor(diff / 1000 / 60 / 60);
    const m = Math.floor((diff / 1000 / 60) % 60);
    embed.addFields({ name: "⏳ Começa em", value: `${h}h ${m}m` });
  } else {
    embed.addFields({ name: "✅ Status", value: "Evento iniciado!" });
  }

  for (const r in group.roles) {
    const role = group.roles[r];
    const members = group.members[r]?.map(u => `<@${u}>`).join("\n") || "—";

    embed.addFields({
      name: `${role.name} (${group.members[r].length}/${role.limit})`,
      value: members,
      inline: true
    });
  }

  return embed;
}

/* ======================= BOTÕES ======================= */

function buildButtons(group, msgId) {
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
      .setCustomId(`ping_${msgId}`)
      .setLabel("Ping")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(started)
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
  console.log("Bot online!");
  await loadGroups();
  await limparBotoesAntigos();

  const commands = [
    new SlashCommandBuilder()
      .setName("criar")
      .setDescription("Criar grupo")

      .addStringOption(o =>
        o.setName("tipo")
          .setDescription("Tipo do grupo (ex: DG, Ava, HCE)")
          .setRequired(true)
      )

      .addIntegerOption(o =>
        o.setName("jogadores")
          .setDescription("Quantidade total de jogadores")
          .setRequired(true)
      )

      .addStringOption(o =>
        o.setName("classes")
          .setDescription("Ex: 1 Tank, 1 Healer, 3 DPS")
          .setRequired(true)
      )

      .addStringOption(o =>
        o.setName("data")
          .setDescription("Data no formato DD/MM/AAAA")
          .setRequired(true)
      )

      .addStringOption(o =>
        o.setName("horario")
          .setDescription("Horário no formato HH:MM")
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName("divisao")
      .setDescription("Dividir loot")

      .addIntegerOption(o =>
        o.setName("loot")
          .setDescription("Valor total do loot")
          .setRequired(true)
      )

      .addIntegerOption(o =>
        o.setName("jogadores")
          .setDescription("Quantidade de jogadores")
          .setRequired(true)
      )

  ].map(c => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  await rest.put(
    Routes.applicationCommands(client.user.id),
    { body: commands }
  );
});

/* ======================= INTERAÇÕES ======================= */

client.on("interactionCreate", async i => {

  if (i.isChatInputCommand()) {

    if (i.commandName === "criar") {
      const roles = parseRoles(i.options.getString("classes"));
      const members = {};
      for (const r in roles) members[r] = [];

      const group = {
        title: i.options.getString("tipo"),
        total: i.options.getInteger("jogadores"),
        roles,
        members,
        startDate: parseDateTime(
          i.options.getString("data"),
          i.options.getString("horario")
        ),
        channelId: i.channelId
      };

      const msg = await i.reply({
        embeds: [buildEmbed(group)],
        fetchReply: true
      });

      groups.set(msg.id, group);
      await msg.edit({ components: buildButtons(group, msg.id) });
      await saveGroups();
    }

    if (i.commandName === "divisao") {
      const loot = i.options.getInteger("loot");
      const jogadores = i.options.getInteger("jogadores");
      const valor = Math.floor(loot / jogadores);

      return i.reply(`💰 Cada jogador recebe: ${valor.toLocaleString("pt-BR")}`);
    }
  }

  if (i.isButton()) {
    await i.deferUpdate();

    const [action, msgId, role] = i.customId.split("_");
    const group = groups.get(msgId);
    if (!group) return;

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

    if (action === "ping") {
      const mentions = [];
      for (const r in group.members)
        group.members[r].forEach(id => mentions.push(`<@${id}>`));

      if (mentions.length) await channel.send(mentions.join(" "));
    }

    await msg.edit({
      embeds: [buildEmbed(group)],
      components: buildButtons(group, msgId)
    });

    await saveGroups();
  }
});

/* ======================= ATUALIZAÇÃO ======================= */

setInterval(async () => {
  for (const [msgId, group] of groups.entries()) {
    try {
      const channel = await client.channels.fetch(group.channelId);
      const msg = await channel.messages.fetch(msgId);
      await msg.edit({
        embeds: [buildEmbed(group)],
        components: buildButtons(group, msgId)
      });
    } catch {}
  }
}, 60000);

/* ======================= LOGIN ======================= */

client.login(process.env.DISCORD_TOKEN);

/* ======================= HTTP PARA RENDER ======================= */

const port = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.end("Bot online");
}).listen(port);
