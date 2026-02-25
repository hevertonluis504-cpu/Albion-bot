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
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const groups = new Map();

/* ======================= SALVAR / CARREGAR ======================= */
async function saveGroups() {
  try {
    const data = Object.fromEntries(groups);
    await fs.writeFile("./groups.json", JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Erro ao salvar:", e);
  }
}

async function loadGroups() {
  try {
    await fs.access("./groups.json").catch(() => null);
    const data = JSON.parse(await fs.readFile("./groups.json", "utf8"));
    for (const id in data) {
      data[id].startDate = new Date(data[id].startDate);
      groups.set(id, data[id]);
    }
  } catch (e) {
    console.error("Erro ao carregar:", e);
  }
}

/* ======================= UTIL ======================= */
function getEmoji(roleName) {
  const name = roleName.toLowerCase();
  if (name.includes("tank")) return "🛡️";
  if (name.includes("heal")) return "💉";
  if (name.includes("dps")) return "🔥";
  if (name.includes("arcano")) return "✨";
  if (name.includes("suporte")) return "🧩";
  return "⚔️";
}

function parseRoles(input) {
  const roles = {};
  input.split(",").forEach(p => {
    const match = p.trim().match(/^(\d+)\s+(.+)$/);
    if (match) {
      const [_, qty, name] = match;
      roles[name.trim()] = { name: name.trim(), limit: parseInt(qty) };
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
      `📅 Data: ${formatDate(group.startDate)}\n` +
      `🕒 Horário: ${formatTime(group.startDate)} UTC-3\n` +
      `📝 ${group.description}\n\n` +
      `👥 Total: ${group.total}`
    );

  // Tempo restante
  const diff = group.startDate - now;
  if (diff > 0) {
    const hours = Math.floor(diff / 1000 / 60 / 60);
    const minutes = Math.floor((diff / 1000 / 60) % 60);
    embed.addFields({ name: "⏳ Começa em", value: `${hours}h ${minutes}m`, inline: true });
  } else {
    embed.addFields({ name: "✅ Status", value: "Evento iniciado!", inline: true });
  }

  for (const key in group.roles) {
    const role = group.roles[key];
    const members = group.members[key]?.map(u => `<@${u.id}>`).join("\n") || "—";
    embed.addFields({
      name: `${getEmoji(role.name)} ${role.name} (${group.members[key].length}/${role.limit})`,
      value: members,
      inline: true
    });
  }

  return embed;
}

/* ======================= BOTÕES ======================= */
function buildButtons(group, msgId) {
  const rows = [];
  const allButtons = [];
  const eventStarted = group.startDate <= new Date();

  for (const key in group.roles) {
    allButtons.push(
      new ButtonBuilder()
        .setCustomId(`join_${msgId}_${key}`)
        .setLabel(`${getEmoji(group.roles[key].name)} ${group.roles[key].name}`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(eventStarted)
    );
  }

  allButtons.push(
    new ButtonBuilder()
      .setCustomId(`leave_${msgId}`)
      .setLabel("🚪 Sair")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(eventStarted),
    new ButtonBuilder()
      .setCustomId(`ping_${msgId}`)
      .setLabel("🔔 Ping")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(eventStarted),
    new ButtonBuilder()
      .setCustomId(`edit_${msgId}`)
      .setLabel("📝 Editar")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(eventStarted)
  );

  let currentRow = new ActionRowBuilder();
  for (const button of allButtons) {
    if (currentRow.components.length === 5) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
    }
    currentRow.addComponents(button);
  }
  if (currentRow.components.length > 0) rows.push(currentRow);
  return rows;
}

/* ======================= READY ======================= */
client.once(Events.ClientReady, async () => {
  console.log(`Bot online como ${client.user.tag}`);
  await loadGroups();

  const commands = [
    new SlashCommandBuilder()
      .setName("criar")
      .setDescription("Criar grupo de conteúdo")
      .addStringOption(o => o.setName("tipo").setDescription("Tipo do conteúdo").setRequired(true))
      .addIntegerOption(o => o.setName("jogadores").setDescription("Total de jogadores").setRequired(true))
      .addStringOption(o => o.setName("classes").setDescription("Ex: 1 Tank, 2 Healer, 3 DPS").setRequired(true))
      .addStringOption(o => o.setName("data").setDescription("DD/MM/AAAA").setRequired(true))
      .addStringOption(o => o.setName("horario").setDescription("HH:MM UTC-3").setRequired(true))
      .addStringOption(o => o.setName("descricao").setDescription("Descrição")),
    new SlashCommandBuilder()
      .setName("divisao")
      .setDescription("Calcular divisão de loot")
      .addIntegerOption(o => o.setName("loot").setDescription("Valor total do loot").setRequired(true))
      .addIntegerOption(o => o.setName("jogadores").setDescription("Quantidade de jogadores").setRequired(false))
      .addStringOption(o => o.setName("mencoes").setDescription("Mencione os jogadores (@user1 @user2)").setRequired(false))
  ].map(c => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
});

/* ======================= INTERAÇÕES ======================= */
client.on("interactionCreate", async i => {
  if (i.isChatInputCommand() && i.commandName === "criar") {
    const roles = parseRoles(i.options.getString("classes"));
    if (!Object.keys(roles).length) return i.reply({ content: "Formato inválido. Use: 1 Tank, 2 Healer", flags: 64 });

    const members = {};
    for (const r in roles) members[r] = [];

    const group = {
      title: i.options.getString("tipo"),
      total: i.options.getInteger("jogadores"),
      roles,
      members,
      description: i.options.getString("descricao") || "Sem descrição",
      startDate: parseDateTime(i.options.getString("data"), i.options.getString("horario")),
      creatorId: i.user.id,
      channelId: i.channelId
    };

    const msg = await i.reply({ embeds: [buildEmbed(group)], components: buildButtons(group, "temp"), fetchReply: true });
    groups.set(msg.id, group);
    await msg.edit({ components: buildButtons(group, msg.id) });
    await saveGroups();
  }

  // Divisão
  if (i.isChatInputCommand() && i.commandName === "divisao") {
    let loot = i.options.getInteger("loot");
    let jogadores = i.options.getInteger("jogadores");
    const mencoes = i.options.getString("mencoes");
    let listaMencoes = [];

    if (mencoes) {
      const matches = mencoes.match(/<@!?(\d+)>/g);
      if (matches) listaMencoes = matches;
    }

    if (jogadores && listaMencoes.length) jogadores = Math.max(jogadores, listaMencoes.length);
    else if (!jogadores && listaMencoes.length) jogadores = listaMencoes.length;
    if (!jogadores || jogadores <= 0) return i.reply({ content: "❌ Informe a quantidade de jogadores ou mencione participantes!", flags: 64 });

    const valor = Math.floor(loot / jogadores);
    const sobra = loot % jogadores;

    const embed = new EmbedBuilder()
      .setTitle("💰 Divisão de Loot")
      .setColor(0x00FF00)
      .addFields(
        { name: "💰 Loot Total", value: loot.toLocaleString("pt-BR"), inline: true },
        { name: "👥 Jogadores", value: jogadores.toString(), inline: true },
        { name: "💎 Cada jogador recebe", value: valor.toLocaleString("pt-BR"), inline: false }
      );

    if (sobra > 0) embed.addFields({ name: "🔹 Sobra", value: sobra.toLocaleString("pt-BR"), inline: false });
    if (listaMencoes.length) embed.addFields({ name: "👤 Participantes", value: listaMencoes.join(" "), inline: false });

    return i.reply({ embeds: [embed], flags: 64 });
  }

  // Botões
  if (i.isButton()) {
    await i.deferUpdate();
    const [action, msgId, roleName] = i.customId.split("_");
    const group = groups.get(msgId);
    if (!group) return;

    const user = i.user;
    const channel = await client.channels.fetch(i.channelId);
    const msg = await channel.messages.fetch(msgId);

    if (action === "leave") {
      for (const r in group.members) group.members[r] = group.members[r].filter(u => u.id !== user.id);
      await msg.edit({ embeds: [buildEmbed(group)], components: buildButtons(group, msgId) });
      await saveGroups();
    }

    if (action === "ping") {
      const mentions = [];
      for (const r in group.members) group.members[r].forEach(u => mentions.push(`<@${u.id}>`));
      if (mentions.length) await channel.send(mentions.join(" "));
    }

    if (action === "edit") {
      if (i.user.id !== group.creatorId) return;
      const dm = await i.user.createDM();
      const questions = [
        { key: "title", text: "Qual é o **novo título** do grupo?" },
        { key: "description", text: "Qual é a **nova descrição** do grupo?" },
        { key: "date", text: "Qual é a **nova data** do grupo (DD/MM/AAAA)?" },
        { key: "time", text: "Qual é o **novo horário** do grupo (HH:MM UTC-3)?" },
        { key: "total", text: "Qual é o **novo total de jogadores**?" },
        { key: "classes", text: "Quais são as **novas classes** (Ex: 1 Tank, 2 Healer, 3 DPS)?" }
      ];

      let step = 0;
      await dm.send(questions[step].text);

      const collector = dm.createMessageCollector({
        filter: msg => msg.author.id === i.user.id,
        time: 300_000
      });

      collector.on("collect", async msg => {
        const answer = msg.content.trim();
        const q = questions[step];

        if (q.key === "total") group.total = parseInt(answer) || group.total;
        else if (q.key === "classes") group.roles = parseRoles(answer);
        else group[q.key] = answer;

        step++;
        if (step < questions.length) await dm.send(questions[step].text);
        else collector.stop("finalizado");
      });

      collector.on("end", async (collected, reason) => {
        if (reason !== "finalizado") return dm.send("⏰ Tempo esgotado! Tente editar novamente.");
        group.startDate = parseDateTime(group.date, group.time);

        for (const key in group.roles) {
          if (!group.members[key]) group.members[key] = [];
          if (group.members[key].length > group.roles[key].limit)
            group.members[key] = group.members[key].slice(0, group.roles[key].limit);
        }

        await msg.edit({ embeds: [buildEmbed(group)], components: buildButtons(group, msgId) });
        await saveGroups();
        await dm.send("✅ Grupo atualizado com sucesso!");
      });
    }

    if (action === "join") {
      for (const r in group.members) group.members[r] = group.members[r].filter(u => u.id !== user.id);
      if (group.members[roleName].length < group.roles[roleName].limit) group.members[roleName].push({ id: user.id, username: user.tag });
      await msg.edit({ embeds: [buildEmbed(group)], components: buildButtons(group, msgId) });
      await saveGroups();
    }
  }
});

/* ======================= ATUALIZAÇÃO PERIÓDICA ======================= */
setInterval(async () => {
  for (const [msgId, group] of groups.entries()) {
    const channel = await client.channels.fetch(group.channelId).catch(() => null);
    if (!channel) continue;
    const msg = await channel.messages.fetch(msgId).catch(() => null);
    if (!msg) continue;
    await msg.edit({ embeds: [buildEmbed(group)], components: buildButtons(group, msgId) });
  }
}, 60_000);

/* ======================= LOGIN ======================= */
client.login(process.env.DISCORD_TOKEN);

/* ======================= SERVIDOR HTTP MINIMO ======================= */
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Bot online!\n");
}).listen(port, () => console.log(`Servidor web rodando na porta ${port}`));
