const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits
} = require("discord.js");
const express = require("express");
const fs = require("node:fs");
const path = require("node:path");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const PORT = process.env.PORT || 10000;

if (!TOKEN || !CLIENT_ID) {
  console.error("Configure DISCORD_TOKEN e CLIENT_ID nas variáveis de ambiente.");
  process.exit(1);
}

const dataDir = path.join(__dirname, "..", "data");
const dataFile = path.join(dataDir, "events.json");
fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(dataFile)) fs.writeFileSync(dataFile, "{}");

function loadData() {
  try { return JSON.parse(fs.readFileSync(dataFile, "utf8")); }
  catch { return {}; }
}
let events = loadData();

function saveData() {
  fs.writeFileSync(dataFile, JSON.stringify(events, null, 2));
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
  new SlashCommandBuilder()
    .setName("painel")
    .setDescription("Publica o painel permanente para criar eventos")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
];

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  const route = GUILD_ID
    ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
    : Routes.applicationCommands(CLIENT_ID);
  await rest.put(route, { body: commands.map(c => c.toJSON()) });
  console.log("Comando /painel registrado.");
}

function makePanel() {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({ name: "ALBION CONTENTS", iconURL: client.user.displayAvatarURL() })
    .setDescription("⚔️ **PAINEL DE EVENTOS**\nClique no botão abaixo para criar um evento. Você poderá definir título, data, horário, descrição, emojis e classes.");
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("event_create")
        .setLabel("Criar Evento")
        .setEmoji("➕")
        .setStyle(ButtonStyle.Primary)
    );
    return { embeds: [embed], components: [row] };
}

function parseClasses(raw) {
  const lines = raw.split("\n").map(x => x.trim()).filter(Boolean);
  if (!lines.length) throw new Error("Informe pelo menos uma classe.");
  if (lines.length > 20) throw new Error("O limite é de 20 classes por evento.");
  return lines.map(line => {
    const splitAt = line.indexOf("|");
    if (splitAt < 1 || splitAt === line.length - 1) {
      throw new Error(`Formato inválido: "${line}". Use emoji | nome da classe.`);
    }
    const emoji = line.slice(0, splitAt).trim();
    const name = line.slice(splitAt + 1).trim();
    if (!name) throw new Error("Toda classe precisa ter um nome.");
    return { emoji, name, users: [] };
  });
}

function makeEventEmbed(event) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({ name: "ALBION CONTENTS", iconURL: client.user.displayAvatarURL() })
    .setTitle(`${event.title}`)
    .setDescription(
      `📅 **${event.date} às ${event.time}**\n` +
      `${event.description ? `📝 ${event.description}\n` : ""}` +
      `\n**Inscrições por classe**`
    )
    .setFooter({ text: `Evento criado por ${event.createdByName}` })
    .setTimestamp(new Date(event.createdAt));

  for (const cls of event.classes) {
    const mentions = cls.users.length
      ? cls.users.map(id => `<@${id}>`).join("\n")
      : "_Ninguém inscrito ainda_";
    embed.addFields({
      name: `${cls.emoji} ${cls.name} • ${cls.users.length}`,
      value: mentions.slice(0, 1024)
    });
  }
  return embed;
}

function makeEventComponents(event) {
  const rows = [];
  let current = new ActionRowBuilder();
  for (let i = 0; i < event.classes.length; i++) {
    const cls = event.classes[i];
    current.addComponents(
      new ButtonBuilder()
        .setCustomId(`join:${event.id}:${i}`)
        .setLabel(cls.name.slice(0, 80))
        .setEmoji(cls.emoji)
        .setStyle(ButtonStyle.Primary)
    );
    if (current.components.length === 5) {
      rows.push(current);
      current = new ActionRowBuilder();
    }
  }
  if (current.components.length) rows.push(current);

  const actions = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`leave:${event.id}`)
      .setLabel("Sair")
      .setEmoji("🚪")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`edit:${event.id}`)
      .setLabel("Editar")
      .setEmoji("✏️")
      .setStyle(ButtonStyle.Secondary)
  );
  if (rows.length < 5) rows.push(actions);
  return rows;
}

function buildModal(customId, event = null) {
  const modal = new ModalBuilder()
    .setCustomId(customId)
    .setTitle(event ? "Editar evento" : "Criar evento");

  const fields = [
    ["title", "Título do evento", TextInputStyle.Short, event?.title || "", "Ex.: baú azul do espacas", true],
    ["date", "Data", TextInputStyle.Short, event?.date || "", "DD/MM/AAAA", true],
    ["time", "Horário", TextInputStyle.Short, event?.time || "", "HH:MM", true],
    ["description", "Descrição", TextInputStyle.Paragraph, event?.description || "", "Informações e observações do evento", false],
    ["classes", "Emojis e nomes das classes", TextInputStyle.Paragraph,
      event ? event.classes.map(c => `${c.emoji} | ${c.name}`).join("\n") : "💚 | HEALER\n🛡️ | TANK\n⚔️ | DPSs",
      "Uma classe por linha: emoji | nome", true]
  ];

  for (const [id, label, style, value, placeholder, required] of fields) {
    const input = new TextInputBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setStyle(style)
      .setRequired(required)
      .setMaxLength(id === "description" || id === "classes" ? 1000 : 100)
      .setPlaceholder(placeholder);
    if (value) input.setValue(value.slice(0, 1000));
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }
  return modal;
}

function validDateTime(date, time) {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(date)) return false;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return false;
  const [d, m, y] = date.split("/").map(Number);
  const check = new Date(y, m - 1, d);
  return check.getFullYear() === y && check.getMonth() === m - 1 && check.getDate() === d;
}

async function refreshEvent(event) {
  const channel = await client.channels.fetch(event.channelId);
  if (!channel || !channel.isTextBased()) return;
  const message = await channel.messages.fetch(event.messageId);
  await message.edit({ embeds: [makeEventEmbed(event)], components: makeEventComponents(event) });
}

client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === "painel") {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: "Você precisa ser administrador ou ter Gerenciar Servidor.", ephemeral: true });
      }
      return interaction.channel.send(makePanel()).then(() =>
        interaction.reply({ content: "Painel publicado!", ephemeral: true })
      );
    }

    if (interaction.isButton() && interaction.customId === "event_create") {
      return interaction.showModal(buildModal("event_modal:new"));
    }

    if (interaction.isButton() && interaction.customId.startsWith("join:")) {
      const [, eventId, classIndexText] = interaction.customId.split(":");
      const event = events[eventId];
      const classIndex = Number(classIndexText);
      if (!event || !event.classes[classIndex]) {
        return interaction.reply({ content: "Esse evento não foi encontrado.", ephemeral: true });
      }
      for (const cls of event.classes) cls.users = cls.users.filter(id => id !== interaction.user.id);
      event.classes[classIndex].users.push(interaction.user.id);
      saveData();
      await refreshEvent(event);
      return interaction.reply({ content: `Inscrição confirmada: ${event.classes[classIndex].emoji} ${event.classes[classIndex].name}.`, ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId.startsWith("leave:")) {
      const eventId = interaction.customId.split(":")[1];
      const event = events[eventId];
      if (!event) return interaction.reply({ content: "Esse evento não foi encontrado.", ephemeral: true });
      for (const cls of event.classes) cls.users = cls.users.filter(id => id !== interaction.user.id);
      saveData();
      await refreshEvent(event);
      return interaction.reply({ content: "Você saiu do evento.", ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId.startsWith("edit:")) {
      const eventId = interaction.customId.split(":")[1];
      const event = events[eventId];
      if (!event) return interaction.reply({ content: "Esse evento não foi encontrado.", ephemeral: true });
      const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
      if (interaction.user.id !== event.createdBy && !isAdmin) {
        return interaction.reply({ content: "Somente quem criou o evento ou um administrador pode editá-lo.", ephemeral: true });
      }
      return interaction.showModal(buildModal(`event_modal:${eventId}`, event));
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith("event_modal:")) {
      const eventId = interaction.customId.split(":")[1];
      const title = interaction.fields.getTextInputValue("title").trim();
      const date = interaction.fields.getTextInputValue("date").trim();
      const time = interaction.fields.getTextInputValue("time").trim();
      const description = interaction.fields.getTextInputValue("description").trim();
      let classes;
      if (!validDateTime(date, time)) {
        return interaction.reply({ content: "Data ou horário inválido. Use data DD/MM/AAAA e horário HH:MM (24 horas).", ephemeral: true });
      }
      try { classes = parseClasses(interaction.fields.getTextInputValue("classes")); }
      catch (error) { return interaction.reply({ content: error.message, ephemeral: true }); }

      if (eventId === "new") {
        const id = `${Date.now()}-${interaction.user.id}`;
        const event = {
          id, title, date, time, description, classes,
          createdBy: interaction.user.id,
          createdByName: interaction.user.username,
          createdAt: new Date().toISOString(),
          channelId: interaction.channelId,
          messageId: null
        };
        const message = await interaction.channel.send({
          embeds: [makeEventEmbed(event)],
          components: makeEventComponents(event)
        });
        event.messageId = message.id;
        events[id] = event;
        saveData();
        return interaction.reply({ content: "Evento criado e publicado com sucesso!", ephemeral: true });
      }

      const event = events[eventId];
      if (!event) return interaction.reply({ content: "Esse evento não foi encontrado.", ephemeral: true });
      const oldClasses = event.classes;
      classes = classes.map(newClass => {
        const old = oldClasses.find(c => c.name.toLowerCase() === newClass.name.toLowerCase());
        return { ...newClass, users: old ? old.users : [] };
      });
      Object.assign(event, { title, date, time, description, classes });
      saveData();
      await refreshEvent(event);
      return interaction.reply({ content: "Evento atualizado!", ephemeral: true });
    }
  } catch (error) {
    console.error(error);
    const message = "Ocorreu um erro ao processar. Confira os dados e tente novamente.";
    if (interaction.isRepliable()) {
      if (interaction.deferred || interaction.replied) await interaction.followUp({ content: message, ephemeral: true }).catch(() => {});
      else await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
    }
  }
});

const app = express();
app.get("/", (_req, res) => res.send("Albion Contents Bot online."));
app.get("/health", (_req, res) => res.status(200).send("ok"));
app.listen(PORT, () => console.log(`Servidor HTTP ativo na porta ${PORT}.`));

client.once("ready", async () => {
  console.log(`Bot conectado como ${client.user.tag}`);
  try { await registerCommands(); }
  catch (error) { console.error("Falha ao registrar comandos:", error); }
});

client.login(TOKEN);
