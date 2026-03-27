require("dotenv").config();
const fs = require("fs");
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

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.on("error", console.error);

const groups = new Map();

/* ================= SALVAR / CARREGAR ================= */

function saveGroups() {
  try {
    const data = Object.fromEntries(groups);
    fs.writeFileSync("./groups.json", JSON.stringify(data, null, 2));
    console.log(`[Sistema] Grupos salvos (${groups.size})`);
  } catch (e) {
    console.error("Erro ao salvar:", e);
  }
}

function loadGroups() {
  try {
    if (fs.existsSync("./groups.json")) {
      const data = JSON.parse(fs.readFileSync("./groups.json", "utf8"));
      for (const id in data) {
        data[id].startDate = new Date(data[id].startDate);
        groups.set(id, data[id]);
      }
      console.log(`[Sistema] ${groups.size} grupos carregados.`);
    }
  } catch (e) {
    console.error("Erro ao carregar:", e);
  }
}

/* ================= UTIL ================= */

function getEmoji(roleName){

  const name = roleName.toLowerCase();

  if(name.includes("incubus")) return "<:Incubus:1479601055816749212>";
  if(name.includes("aguia")) return "<:aguia:1479601119612240003>";
  if(name.includes("chama")) return "<:chamasombra:1479601382318280926>";
  if(name.includes("dps")) return "<:dps:1479601155582459904>";
  if(name.includes("foice")) return "<:foice:1479601139338186834>";
  if(name.includes("fulgurante")) return "<:fulgurante:1479601175157407907>";
  if(name.includes("healer")) return "<:healer:1479601216831885512>";
  if(name.includes("mainhealer")) return "<:mainhealer:1479600899067347070>";
  if(name.includes("maintank")) return "<:maintank:1479600981342949536>";
  if(name.includes("raizbm")) return "<:raizbm:1479601235014320201>";
  if(name.includes("oculto")) return "<:oculto:1479601337367789621>";
  if(name.includes("offtank")) return "<:offtank:1479601014440067082>";
  if(name.includes("paratempo")) return "<:paratempo:1479601362231886007>";
  if(name.includes("prisma")) return "<:prisma:1479601196938428597>";
  if(name.includes("ptheal")) return "<:ptheal:1479601036153983058>";
  if(name.includes("quebrareinos")) return "<:quebrareinos:1479601271584325633>";
  if(name.includes("silence")) return "<:silence:1479601096644104376>";
  if(name.includes("uivo")) return "<:uivo:1479601081544736830>";
  if(name.includes("tank")) return "<:tank:1479709733559730277>";
  if(name.includes("badon")) return "<:badon:1479710170132119552>";
  if(name.includes("raizferrea")) return "<:raizferrea:1480898476324819035>";
  if(name.includes("arcolongo")) return "<:arcolongo:1480899757189763233>";
  if(name.includes("susurante")) return "<:susurante:1480899728748314686>";
  if(name.includes("furabruma")) return "<:furabruma:1480899700549877791>";
  if(name.includes("bruxo")) return "<:bruxo:1487148891928264735>";

  return "⚔️";
}

function parseRoles(input) {
  const roles = {};
  const parts = input.split(",");
  for (const p of parts) {
    const match = p.trim().match(/^(\d+)\s+(.+)$/);
    if (match) {
      const qty = parseInt(match[1]);
      const name = match[2].trim();
      roles[name] = { name, limit: qty };
    }
  }
  return roles;
}

function parseDateTime(dateStr, timeStr) {
  const [d, m, y] = dateStr.split("/").map(Number);
  const [h, min] = timeStr.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, h + 3, min));
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

/* ================= EMBED ================= */

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
    const emoji = getEmoji(role.name);
    const members =
      group.members[key].map(u => `<@${u.id}>`).join("\n") || "—";

    embed.addFields({
      name: `${emoji} ${role.name} (${group.members[key].length}/${role.limit})`,
      value: members,
      inline: true
    });
  }

  return embed;
}

/* ================= BOTÕES ================= */

function buildButtons(group) {

  const rows = [];
  let currentRow = new ActionRowBuilder();
  const allButtons = [];

  for (const key in group.roles) {

    const role = group.roles[key];
    const emoji = getEmoji(role.name);

    allButtons.push(
      new ButtonBuilder()
        .setCustomId("join_" + key)
        .setEmoji(emoji) 
        .setLabel(role.name) 
        .setStyle(ButtonStyle.Primary)
    );
  }

  allButtons.push(
    new ButtonBuilder()
      .setCustomId("leave")
      .setLabel("🚪 Sair")
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId("ping_all")
      .setLabel("🔔 Ping")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("edit_group")
      .setLabel("📝 Editar")
      .setStyle(ButtonStyle.Secondary)
  );

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

/* ================= MODAIS ADICIONADOS ================= */

function buildEditModal(group) {
  const modal = new ModalBuilder()
    .setCustomId("edit_modal")
    .setTitle("Editar Grupo");

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("edit_tipo")
        .setLabel("Tipo/Nome do Evento")
        .setStyle(TextInputStyle.Short)
        .setValue(group.title)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("edit_jogadores")
        .setLabel("Total de Jogadores")
        .setStyle(TextInputStyle.Short)
        .setValue(group.total.toString())
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("edit_classes")
        .setLabel("Classes")
        .setStyle(TextInputStyle.Paragraph)
        .setValue(Object.values(group.roles).map(r => `${r.limit} ${r.name}`).join(", "))
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("edit_data")
        .setLabel("Data")
        .setStyle(TextInputStyle.Short)
        .setValue(formatDate(group.startDate))
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("edit_horario")
        .setLabel("Horário")
        .setStyle(TextInputStyle.Short)
        .setValue(formatTime(group.startDate))
        .setRequired(true)
    )
  );

  return modal;
}

/* ================= INTERAÇÕES ================= */

client.on("interactionCreate", async i => {

  if (i.isButton()) {
    const group = groups.get(i.message.id);
    if (!group) return;

    // EDITAR
    if (i.customId === "edit_group") {
      if (i.user.id !== group.creatorId)
        return i.reply({ content: "❌ Apenas o criador pode editar.", ephemeral: true });

      return i.showModal(buildEditModal(group));
    }
  }

  // MODAL
  if (i.isModalSubmit() && i.customId === "edit_modal") {
    const group = groups.get(i.message.id);
    if (!group) return;

    const newRoles = parseRoles(i.fields.getTextInputValue("edit_classes"));

    group.title = i.fields.getTextInputValue("edit_tipo");
    group.total = parseInt(i.fields.getTextInputValue("edit_jogadores"));
    group.startDate = parseDateTime(
      i.fields.getTextInputValue("edit_data"),
      i.fields.getTextInputValue("edit_horario")
    );

    const newMembers = {};
    for (const r in newRoles) newMembers[r] = [];

    for (const r in group.roles) {
      if (newRoles[r]) {
        newMembers[r] = group.members[r].slice(0, newRoles[r].limit);
      }
    }

    group.roles = newRoles;
    group.members = newMembers;

    await i.update({
      embeds: [buildEmbed(group)],
      components: buildButtons(group)
    });

    saveGroups();
  }
});

client.login(process.env.DISCORD_TOKEN);
