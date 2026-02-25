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
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
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
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

/* ======================= EMBED ======================= */
function buildEmbed(group) {
  const embed = new EmbedBuilder()
    .setTitle(`⚔️ ${group.title}`)
    .setColor(0x5865F2)
    .setDescription(
      `📅 Data: ${formatDate(group.startDate)}\n` +
      `🕒 Horário: ${formatTime(group.startDate)} UTC-3\n` +
      `📝 ${group.description}\n\n` +
      `👥 Total: ${group.total}`
    );

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

  for (const key in group.roles) {
    allButtons.push(
      new ButtonBuilder()
        .setCustomId(`join_${msgId}_${key}`)
        .setLabel(`${getEmoji(group.roles[key].name)} ${group.roles[key].name}`)
        .setStyle(ButtonStyle.Primary)
    );
  }

  allButtons.push(
    new ButtonBuilder()
      .setCustomId(`leave_${msgId}`)
      .setLabel("🚪 Sair")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`ping_all_${msgId}`)
      .setLabel("🔔 Ping")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`edit_group_${msgId}`)
      .setLabel("📝 Editar")
      .setStyle(ButtonStyle.Secondary)
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

  // ===== CRIAR =====
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
      creatorId: i.user.id
    };

    const msg = await i.reply({ embeds: [buildEmbed(group)], components: buildButtons(group, "temp"), withResponse: true });

    groups.set(msg.id, group);
    // Atualiza os botões com ID real da mensagem
    await i.editReply({ components: buildButtons(group, msg.id) });
    await saveGroups();
  }

  // ===== DIVISÃO =====
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

  // ===== BOTÕES =====
  if (i.isButton()) {
    const [action, msgId, roleName] = i.customId.split("_");
    const group = groups.get(msgId);
    if (!group) return i.reply({ content: "Evento expirado.", flags: 64 });
    const user = i.user;

    if (action === "leave") {
      for (const r in group.members) group.members[r] = group.members[r].filter(u => u.id !== user.id);
      await i.update({ embeds: [buildEmbed(group)], components: buildButtons(group, msgId) });
      await saveGroups();
      return;
    }

    if (action === "ping") {
      const mentions = [];
      for (const r in group.members) group.members[r].forEach(u => mentions.push(`<@${u.id}>`));
      if (!mentions.length) return i.reply({ content: "Ninguém no grupo.", flags: 64 });
      return i.reply({ content: mentions.join(" "), flags: 64 });
    }

    if (action === "edit") {
      if (i.user.id !== group.creatorId) return i.reply({ content: "❌ Apenas o criador pode editar este grupo.", flags: 64 });

      const modal = new ModalBuilder().setCustomId(`editGroup_${msgId}`).setTitle("Editar Grupo");

      const titleInput = new TextInputBuilder().setCustomId("newTitle").setLabel("Título").setStyle(TextInputStyle.Short).setValue(group.title).setRequired(true);
      const descInput = new TextInputBuilder().setCustomId("newDesc").setLabel("Descrição").setStyle(TextInputStyle.Paragraph).setValue(group.description).setRequired(false);
      const dateInput = new TextInputBuilder().setCustomId("newDate").setLabel("Data (DD/MM/AAAA)").setStyle(TextInputStyle.Short).setValue(formatDate(group.startDate)).setRequired(true);
      const timeInput = new TextInputBuilder().setCustomId("newTime").setLabel("Horário (HH:MM UTC-3)").setStyle(TextInputStyle.Short).setValue(formatTime(group.startDate)).setRequired(true);
      const totalInput = new TextInputBuilder().setCustomId("newTotal").setLabel("Total de jogadores").setStyle(TextInputStyle.Short).setValue(group.total.toString()).setRequired(true);
      const classesInput = new TextInputBuilder().setCustomId("newClasses").setLabel("Classes (Ex: 1 Tank, 2 Healer, 3 DPS)").setStyle(TextInputStyle.Paragraph).setValue(Object.keys(group.roles).map(k => `${group.roles[k].limit} ${group.roles[k].name}`).join(", ")).setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(titleInput));
      modal.addComponents(new ActionRowBuilder().addComponents(descInput));
      modal.addComponents(new ActionRowBuilder().addComponents(dateInput));
      modal.addComponents(new ActionRowBuilder().addComponents(timeInput));
      modal.addComponents(new ActionRowBuilder().addComponents(totalInput));
      modal.addComponents(new ActionRowBuilder().addComponents(classesInput));

      return i.showModal(modal);
    }

    if (action === "join") {
      for (const r in group.members) group.members[r] = group.members[r].filter(u => u.id !== user.id);
      if (group.members[roleName].length >= group.roles[roleName].limit) return i.reply({ content: "Classe cheia.", flags: 64 });
      group.members[roleName].push({ id: user.id, username: user.tag });
      await i.update({ embeds: [buildEmbed(group)], components: buildButtons(group, msgId) });
      await saveGroups();
    }
  }

  // ===== MODAL SUBMIT =====
  if (i.isModalSubmit() && i.customId.startsWith("editGroup_")) {
    const msgId = i.customId.split("_")[1];
    const group = groups.get(msgId);
    if (!group) return i.reply({ content: "Grupo não encontrado.", flags: 64 });

    group.title = i.fields.getTextInputValue("newTitle");
    group.description = i.fields.getTextInputValue("newDesc");
    group.startDate = parseDateTime(i.fields.getTextInputValue("newDate"), i.fields.getTextInputValue("newTime"));
    group.total = parseInt(i.fields.getTextInputValue("newTotal"));
    group.roles = parseRoles(i.fields.getTextInputValue("newClasses"));

    for (const key in group.roles) {
      if (!group.members[key]) group.members[key] = [];
      if (group.members[key].length > group.roles[key].limit) group.members[key] = group.members[key].slice(0, group.roles[key].limit);
    }

    await i.update({ embeds: [buildEmbed(group)], components: buildButtons(group, msgId) });
    await saveGroups();
  }
});

/* ======================= LOGIN ======================= */
client.login(process.env.DISCORD_TOKEN);

/* ======================= SERVIDOR HTTP MINIMO ======================= */
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Bot online!\n");
}).listen(port, () => console.log(`Servidor web rodando na porta ${port}`));
