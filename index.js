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
let ranking = {};
const rankingFile = "./ranking.json";

// ======================= DEBOUNCE SAVE =======================
let saveGroupsTimeout = null;
let saveRankingTimeout = null;
const DEBOUNCE_TIME = 2000; // 2 segundos

async function saveGroupsDebounced() {
  if (saveGroupsTimeout) clearTimeout(saveGroupsTimeout);
  saveGroupsTimeout = setTimeout(async () => {
    const data = Object.fromEntries(groups);
    try { await fs.writeFile("./groups.json", JSON.stringify(data, null, 2)); }
    catch (err) { console.error("Erro salvando groups.json:", err); }
  }, DEBOUNCE_TIME);
}

async function saveRankingDebounced() {
  if (saveRankingTimeout) clearTimeout(saveRankingTimeout);
  saveRankingTimeout = setTimeout(async () => {
    try { await fs.writeFile(rankingFile, JSON.stringify(ranking, null, 2)); }
    catch (err) { console.error("Erro salvando ranking.json:", err); }
  }, DEBOUNCE_TIME);
}

// ======================= LOAD =======================
async function loadRanking() {
  try { ranking = JSON.parse(await fs.readFile(rankingFile, "utf8")); }
  catch { ranking = {}; }
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

// ======================= RANKING =======================
function addPoints(users) {
  for (const id of users) ranking[id] = (ranking[id] || 0) + 1;
  saveRankingDebounced();
}

// ======================= LOGS =======================
async function getLogChannel(guild) {
  let channel = guild.channels.cache.find(c => c.name === "logs-bot");
  if (!channel) {
    channel = await guild.channels.create({
      name: "logs-bot",
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: guild.roles.everyone, allow: [PermissionFlagsBits.ViewChannel] }
      ]
    });
  }
  return channel;
}

// ======================= UTILS =======================
function createBrazilDate(dateStr, timeStr) {
  const [d, m, y] = dateStr.split("/").map(Number);
  const [h, min] = timeStr.split(":").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, h + 3, min));
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
  if (n.includes("arc")) return "🏹";
  if (n.includes("debuff")) return "🌀";
  if (n.includes("suporte")) return "✨";
  return "🔹";
}

function progressBar(current, total) {
  const maxBlocks = 10;
  const filledBlocks = Math.round((current / total) * maxBlocks);
  return "🟢".repeat(filledBlocks) + "⚪".repeat(maxBlocks - filledBlocks);
}

function buildEmbed(group) {
  const now = new Date();
  const diff = group.startDate - now;
  let color = 0x3498db;
  let status = "Aberto";

  if (group.closed) color = 0xe74c3c, status = "Encerrado";
  else if (diff <= 0) color = 0x2ecc71, status = "Iniciado";
  else if (diff <= 10 * 60 * 1000) color = 0xf1c40f, status = "Começando em breve";

  const embed = new EmbedBuilder()
    .setTitle(`⚔️ ${group.title}`)
    .setColor(color)
    .setDescription(
      `📅 <t:${Math.floor(group.startDate.getTime()/1000)}:F>\n` +
      `⏳ <t:${Math.floor(group.startDate.getTime()/1000)}:R>\n\n` +
      `📝 **Descrição:**\n${group.descricao}\n\n` +
      `👥 Total: ${group.total}\n` +
      `📌 Status: ${status}`
    )
    .setFooter({ text: "Sistema Guild PRO" });

  for (const r in group.roles) {
    const membersList = group.members[r] || [];
    embed.addFields({
      name: `${getRoleEmoji(r)} ${r}`,
      value: `${progressBar(membersList.length, group.roles[r].limit)} (${membersList.length}/${group.roles[r].limit})\n\n` +
             (membersList.length ? membersList.map(u => `<@${u}>`).join("\n") : "—"),
      inline: true
    });
  }
  return embed;
}

function buildButtons(group, msgId) {
  if (group.closed) return [];
  const rows = [];
  let row = new ActionRowBuilder();
  const started = group.startDate <= new Date();

  for (const r in group.roles) {
    row.addComponents(new ButtonBuilder()
      .setCustomId(`join_${msgId}_${r}`)
      .setLabel(r)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(started)
    );
    if (row.components.length === 5) { rows.push(row); row = new ActionRowBuilder(); }
  }

  row.addComponents(
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

  if (row.components.length) rows.push(row);
  return rows;
}

// ======================= READY =======================
client.once(Events.ClientReady, async () => {
  console.log("Bot PRO online!");
  await loadGroups();
  await loadRanking();

  const commands = [
    new SlashCommandBuilder()
      .setName("criar")
      .setDescription("Criar evento de grupo")
      .addStringOption(o => o.setName("tipo").setDescription("Tipo do evento").setRequired(true))
      .addIntegerOption(o => o.setName("jogadores").setDescription("Total de jogadores").setRequired(true))
      .addStringOption(o => o.setName("classes").setDescription("Ex: 1 Tank, 1 Healer, 3 DPS").setRequired(true))
      .addStringOption(o => o.setName("data").setDescription("DD/MM/AAAA").setRequired(true))
      .addStringOption(o => o.setName("horario").setDescription("HH:MM").setRequired(true))
      .addStringOption(o => o.setName("descricao").setDescription("Descrição do evento").setRequired(false)),
    new SlashCommandBuilder()
      .setName("ranking")
      .setDescription("Ver ranking da guilda")
  ].map(c => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
});

// ======================= INTERAÇÕES =======================
client.on("interactionCreate", async i => {
  if (i.isChatInputCommand()) {
    if (i.commandName === "criar") {
      const parsed = parseRoles(i.options.getString("classes"));
      if (parsed.total !== i.options.getInteger("jogadores"))
        return i.reply({ content: "❌ Soma das classes diferente do total.", ephemeral: true });

      const validDate = createBrazilDate(i.options.getString("data"), i.options.getString("horario"));
      if (!validDate) return i.reply({ content: "❌ Data ou horário inválido.", ephemeral: true });

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
        pinged: false,
        descricao: i.options.getString("descricao") || "Sem descrição."
      };

      const msg = await i.reply({ embeds: [buildEmbed(group)], fetchReply: true });
      groups.set(msg.id, group);
      await msg.edit({ components: buildButtons(group, msg.id) });
      saveGroupsDebounced();

      const logChannel = await getLogChannel(i.guild);
      logChannel.send(`📌 Evento "${group.title}" criado por <@${i.user.id}>`);
    }

    if (i.commandName === "ranking") {
      const sorted = Object.entries(ranking).sort((a,b)=>b[1]-a[1]).slice(0,10);
      if (!sorted.length) return i.reply("Nenhum ponto registrado ainda.");
      const text = sorted.map((r,index)=>`**${index+1}.** <@${r[0]}> — ${r[1]} participações`).join("\n");
      i.reply({ content: `🏆 Ranking da Guilda\n\n${text}` });
    }
  }

  if (i.isButton()) {
    await i.deferUpdate();
    const [action,msgId,role] = i.customId.split("_");
    const group = groups.get(msgId);
    if (!group || group.closed) return;

    const channel = await client.channels.fetch(i.channelId);
    const msg = await channel.messages.fetch(msgId);

    if (action==="join") {
      for (const r in group.members) group.members[r] = group.members[r].filter(id=>id!==i.user.id);
      if (group.members[role].length < group.roles[role].limit) group.members[role].push(i.user.id);
    }
    if (action==="leave") { for (const r in group.members) group.members[r] = group.members[r].filter(id=>id!==i.user.id); }
    if (action==="close") {
      if (i.user.id!==group.creator) return;
      group.closed=true;
      const participants = [].concat(...Object.values(group.members));
      addPoints(participants);
      const logChannel = await getLogChannel(i.guild);
      logChannel.send(`🛑 Evento "${group.title}" encerrado por <@${i.user.id}>`);
      await msg.edit({ embeds:[buildEmbed(group)], components:[] });
      saveGroupsDebounced();
      return;
    }

    await msg.edit({ embeds:[buildEmbed(group)], components:buildButtons(group,msgId) });
    saveGroupsDebounced();
  }
});

// ======================= SISTEMA AUTOMÁTICO =======================
setInterval(async () => {
  for (const [msgId, group] of groups.entries()) {
    if (group.closed) continue;
    const now = new Date();
    const diff = group.startDate - now;
    try {
      const channel = await client.channels.fetch(group.channelId);
      const msg = await channel.messages.fetch(msgId);

      if (diff <= 5*60*1000 && diff>0 && !group.pinged) {
        channel.send(`⚠️ Evento "${group.title}" começa em 5 minutos!`);
        group.pinged = true;
      }

      if (diff<=0) await msg.edit({ embeds:[buildEmbed(group)], components:buildButtons(group,msgId) });
    } catch(err){ console.error("Erro no sistema automático:", err); }
  }
}, 30000);

// ======================= LOGIN =======================
client.login(process.env.DISCORD_TOKEN);

// ======================= HTTP =======================
const port = process.env.PORT || 3000;
http.createServer((req,res)=>res.end("Bot PRO online")).listen(port);
