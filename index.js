require("dotenv").config();
const fs = require("fs").promises;
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
const { DateTime, Interval } = require("luxon");

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
  return DateTime.fromObject(
    { year: y, month: m, day: d, hour: h, minute: min },
    { zone: "America/Sao_Paulo" }
  ).toJSDate();
}

function formatDate(d) {
  return DateTime.fromJSDate(d).setZone("America/Sao_Paulo").toFormat("dd/LL/yyyy");
}

function formatTime(d) {
  return DateTime.fromJSDate(d).setZone("America/Sao_Paulo").toFormat("HH:mm");
}

function getTimeRemaining(d) {
  const now = DateTime.now().setZone("America/Sao_Paulo");
  const eventTime = DateTime.fromJSDate(d).setZone("America/Sao_Paulo");
  if (eventTime <= now) return "✅ O evento já começou!";
  const diff = Interval.fromDateTimes(now, eventTime).toDuration(["days","hours","minutes"]).toObject();
  return `${diff.days || 0}d ${diff.hours || 0}h ${diff.minutes || 0}m`;
}

/* ======================= EMBED ======================= */
function buildEmbed(group) {
  const embed = new EmbedBuilder()
    .setTitle(`⚔️ ${group.title}`)
    .setColor(0x5865F2)
    .setDescription(
      `📅 Data: ${formatDate(group.startDate)}\n` +
      `🕒 Horário: ${formatTime(group.startDate)} UTC-3\n` +
      `⏳ Tempo restante: ${getTimeRemaining(group.startDate)}\n` +
      `📝 ${group.description}\n\n` +
      `👥 Total: ${group.total}`
    );

  for (const key in group.roles) {
    const role = group.roles[key];
    const members = group.members[key]?.map(u => u.username || `<@${u.id}>`).join("\n") || "—";
    embed.addFields({
      name: `${getEmoji(role.name)} ${role.name} (${group.members[key].length}/${role.limit})`,
      value: members,
      inline: true
    });
  }
  return embed;
}

/* ======================= BOTÕES COM PAGINAÇÃO ======================= */
function buildButtons(group, page = 0) {
  const rows = [];
  const roleKeys = Object.keys(group.roles);
  const pageSize = 5;
  const start = page * pageSize;
  const end = start + pageSize;

  // Botões de roles
  const roleRow = new ActionRowBuilder();
  roleKeys.slice(start, end).forEach(key => {
    roleRow.addComponents(
      new ButtonBuilder()
        .setCustomId("join_" + key)
        .setLabel(`${getEmoji(group.roles[key].name)} ${group.roles[key].name}`)
        .setStyle(ButtonStyle.Primary)
    );
  });
  rows.push(roleRow);

  // Navegação
  if (roleKeys.length > pageSize) {
    const navRow = new ActionRowBuilder();
    if (page > 0)
      navRow.addComponents(new ButtonBuilder()
        .setCustomId(`prevPage_${page - 1}`)
        .setLabel("⬅️ Anterior")
        .setStyle(ButtonStyle.Secondary));
    if (end < roleKeys.length)
      navRow.addComponents(new ButtonBuilder()
        .setCustomId(`nextPage_${page + 1}`)
        .setLabel("➡️ Próxima")
        .setStyle(ButtonStyle.Secondary));
    rows.push(navRow);
  }

  // Botões gerais
  const generalRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("leave").setLabel("🚪 Sair").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("ping_all").setLabel("🔔 Ping").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("edit_group").setLabel("📝 Editar").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("time_remaining").setLabel("⏳ Tempo restante").setStyle(ButtonStyle.Secondary)
  );
  rows.push(generalRow);

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
    if (!Object.keys(roles).length)
      return i.reply({ content: "Formato inválido. Use: 1 Tank, 2 Healer", ephemeral: true });

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
      page: 0
    };

    const msg = await i.reply({
      embeds: [buildEmbed(group)],
      components: buildButtons(group),
      fetchReply: true
    });

    groups.set(msg.id, group);
    await saveGroups();
  }

  // ===== DIVISÃO =====
  if (i.isChatInputCommand() && i.commandName === "divisao") {
    const loot = i.options.getInteger("loot");
    let jogadores = i.options.getInteger("jogadores");
    const mencoes = i.options.getString("mencoes");

    let listaMencoes = [];
    if (mencoes) {
      const matches = mencoes.match(/<@!?(\d+)>/g);
      if (matches) listaMencoes = matches;
    }

    if (jogadores && listaMencoes.length) jogadores = Math.max(jogadores, listaMencoes.length);
    else if (!jogadores && listaMencoes.length) jogadores = listaMencoes.length;

    if (!jogadores || jogadores <= 0)
      return i.reply({ content: "❌ Informe a quantidade de jogadores ou mencione participantes!", ephemeral: true });

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

    return i.reply({ embeds: [embed] });
  }

  // ===== BOTÕES =====
  if (i.isButton()) {
    const group = groups.get(i.message.id);
    if (!group) return i.reply({ content: "Evento expirado.", ephemeral: true });
    const user = i.user;

    // PAGINAÇÃO
    if (i.customId.startsWith("nextPage_") || i.customId.startsWith("prevPage_")) {
      group.page = parseInt(i.customId.split("_")[1]);
      await i.update({ embeds: [buildEmbed(group)], components: buildButtons(group, group.page) });
      return;
    }

    // SAIR
    if (i.customId === "leave") {
      for (const r in group.members) group.members[r] = group.members[r].filter(u => u.id !== user.id);
      await i.update({ embeds: [buildEmbed(group)], components: buildButtons(group, group.page) });
      await saveGroups();
      return;
    }

    // PING
    if (i.customId === "ping_all") {
      const mentions = [];
      for (const r in group.members) group.members[r].forEach(u => mentions.push(`<@${u.id}>`));
      if (!mentions.length) return i.reply({ content: "Ninguém no grupo.", ephemeral: true });
      return i.reply({ content: mentions.join(" ") });
    }

    // TEMPO RESTANTE
    if (i.customId === "time_remaining") {
      return i.reply({ content: `⏳ Tempo restante: ${getTimeRemaining(group.startDate)}`, ephemeral: true });
    }

    // EDITAR
    if (i.customId === "edit_group") {
      if (i.user.id !== group.creatorId)
        return i.reply({ content: "❌ Apenas o criador pode editar este grupo.", ephemeral: true });

      const modal = new ModalBuilder()
        .setCustomId(`editGroup_${i.message.id}`)
        .setTitle("Editar Grupo");

      const titleInput = new TextInputBuilder()
        .setCustomId("newTitle")
        .setLabel("Título")
        .setStyle(TextInputStyle.Short)
        .setValue(group.title)
        .setRequired(true);

      const descInput = new TextInputBuilder()
        .setCustomId("newDesc")
        .setLabel("Descrição")
        .setStyle(TextInputStyle.Paragraph)
        .setValue(group.description)
        .setRequired(false);

      const dateInput = new TextInputBuilder()
        .setCustomId("newDate")
        .setLabel("Data (DD/MM/AAAA)")
        .setStyle(TextInputStyle.Short)
        .setValue(formatDate(group.startDate))
        .setRequired(true);

      const timeInput = new TextInputBuilder()
        .setCustomId("newTime")
        .setLabel("Horário (HH:MM UTC-3)")
        .setStyle(TextInputStyle.Short)
        .setValue(formatTime(group.startDate))
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(titleInput));
      modal.addComponents(new ActionRowBuilder().addComponents(descInput));
      modal.addComponents(new ActionRowBuilder().addComponents(dateInput));
      modal.addComponents(new ActionRowBuilder().addComponents(timeInput));

      return i.showModal(modal);
    }

    // JOIN
    if (i.customId.startsWith("join_")) {
      const role = i.customId.replace("join_", "");
      for (const r in group.members) group.members[r] = group.members[r].filter(u => u.id !== user.id);
      if (group.members[role].length >= group.roles[role].limit)
        return i.reply({ content: "Classe cheia.", ephemeral: true });

      group.members[role].push({ id: user.id, username: user.tag });
      await i.update({ embeds: [buildEmbed(group)], components: buildButtons(group, group.page) });
      await saveGroups();
    }
  }

  // ===== MODAL SUBMIT =====
  if (i.isModalSubmit() && i.customId.startsWith("editGroup_")) {
    const messageId = i.customId.split("_")[1];
    const group = groups.get(messageId);
    if (!group) return i.reply({ content: "Grupo não encontrado.", ephemeral: true });

    group.title = i.fields.getTextInputValue("newTitle");
    group.description = i.fields.getTextInputValue("newDesc");

    const newDate = i.fields.getTextInputValue("newDate");
    const newTime = i.fields.getTextInputValue("newTime");
    group.startDate = parseDateTime(newDate, newTime);

    await i.update({ embeds: [buildEmbed(group)], components: buildButtons(group, group.page) });
    await saveGroups();
  }
});

/* ======================= LOGIN ======================= */
client.login(process.env.DISCORD_TOKEN);
