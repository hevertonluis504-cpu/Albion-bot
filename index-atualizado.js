
/* ======================= BOT GUILD PRO ATUALIZADO ======================= */

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

/* ======================= DATA BRASIL CORRIGIDA ======================= */

function createBrazilDate(dateStr, timeStr) {
  const [d, m, y] = dateStr.split("/").map(Number);
  const [h, min] = timeStr.split(":").map(Number);

  const date = new Date(Date.UTC(y, m - 1, d, h + 3, min));

  if (isNaN(date.getTime())) return false;
  if (date < new Date()) return false;

  return date;
}

/* ======================= PARSE CLASSES ======================= */

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

/* ======================= VISUAL ======================= */

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

client.login(process.env.DISCORD_TOKEN);

const port = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.end("Bot PRO online");
}).listen(port);
