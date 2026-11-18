
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
const GUILD_IDS = (process.env.GUILD_ID || "")
  .split(",")
  .map(id => id.trim())
  .filter(Boolean);
const PORT = process.env.PORT || 10000;

if (!TOKEN || !CLIENT_ID) {
  console.error("Configure DISCORD_TOKEN e CLIENT_ID.");
  process.exit(1);
}

const dataDir = path.join(__dirname, "..", "data");
const dataFile = path.join(dataDir, "events.json");
const configFile = path.join(dataDir, "config.json");

fs.mkdirSync(dataDir, { recursive: true });

if (!fs.existsSync(dataFile)) fs.writeFileSync(dataFile, "{}");

if (!fs.existsSync(configFile)) {
  fs.writeFileSync(configFile, JSON.stringify({
    classes: [
      { emoji: "💚", name: "HEALER" },
      { emoji: "🛡️", name: "TANK" },
      { emoji: "⚔️", name: "DPSs" }
    ]
  }, null, 2));
}

function loadJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

let events = loadJSON(dataFile, {});
let settings = loadJSON(configFile, {
  classes: [
    { emoji: "💚", name: "HEALER" },
    { emoji: "🛡️", name: "TANK" },
    { emoji: "⚔️", name: "DPSs" }
  ]
});

function saveData() {
  fs.writeFileSync(dataFile, JSON.stringify(events, null, 2));
}

function saveSettings() {
  fs.writeFileSync(configFile, JSON.stringify(settings, null, 2));
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const commands = [
  new SlashCommandBuilder()
    .setName("painel")
    .setDescription("Publica o painel de eventos")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
];

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);

  const commandList = commands.map(c => c.toJSON());

  if (GUILD_IDS.length > 0) {
    for (const guildId of GUILD_IDS) {
      await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, guildId),
        { body: commandList }
      );

      console.log(`Comando /painel registrado no servidor: ${guildId}`);
    }
  } else {
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commandList }
    );

    console.log("Comando /painel registrado globalmente.");
  }
}

// HORÁRIO DE BRASÍLIA (UTC-3)
function getEventTimestamp(date, time) {
  const [day, month, year] = date.split("/").map(Number);
  const [hour, minute] = time.split(":").map(Number);

  return Math.floor(
    Date.UTC(year, month - 1, day, hour + 3, minute) / 1000
  );
}

// PAINEL PRINCIPAL
function makePanel() {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({
      name: "ALBION CONTENTS",
      iconURL: client.user.displayAvatarURL()
    })
    .setDescription(
      "⚔️ **PAINEL DE EVENTOS**\n\n" +
      "➕ Criar um novo evento.\n" +
      "⚙️ Configurar nomes e emojis das classes.\n\n" +
      "Escolha uma opção abaixo."
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("event_create")
      .setLabel("Criar Evento")
      .setEmoji("➕")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("event_settings")
      .setLabel("Configurar Classes")
      .setEmoji("⚙️")
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    embeds: [embed],
    components: [row]
  };
}

// LER CLASSES
function parseClasses(raw) {
  const lines = raw.split("\n")
    .map(x => x.trim())
    .filter(Boolean);

  if (!lines.length) {
    throw new Error("Informe pelo menos uma classe.");
  }

  if (lines.length > 20) {
    throw new Error("O limite é de 20 classes.");
  }

  return lines.map(line => {
    const splitAt = line.indexOf("|");

    if (splitAt < 1 || splitAt === line.length - 1) {
      throw new Error(
        `Formato inválido: "${line}". Use emoji | nome.`
      );
    }

    return {
      emoji: line.slice(0, splitAt).trim(),
      name: line.slice(splitAt + 1).trim(),
      users: []
    };
  });
}

// EMBED DO EVENTO
function makeEventEmbed(event) {
  const timestamp = getEventTimestamp(event.date, event.time);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({
      name: "ALBION CONTENTS",
      iconURL: client.user.displayAvatarURL()
    })
    .setTitle(event.title)
    .setDescription(
      `📅 **${event.date} às ${event.time}**\n` +
      `⏳ **Tempo restante:** <t:${timestamp}:R>\n` +
      `${event.description ? `📝 ${event.description}\n` : ""}` +
      "\n**Inscrições por classe**"
    )
    .setFooter({
      text: `Evento criado por ${event.createdByName}`
    })
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

// BOTÕES DO EVENTO
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

// FORMULÁRIO DE EVENTO
function buildModal(customId, event = null) {
  const modal = new ModalBuilder()
    .setCustomId(customId)
    .setTitle(event ? "Editar evento" : "Criar evento");

  const defaultClasses = settings.classes
    .map(c => `${c.emoji} | ${c.name}`)
    .join("\n");

  const fields = [
    ["title", "Título do evento", TextInputStyle.Short,
      event?.title || "", "Nome do evento", true],

    ["date", "Data", TextInputStyle.Short,
      event?.date || "", "DD/MM/AAAA", true],

    ["time", "Horário", TextInputStyle.Short,
      event?.time || "", "HH:MM", true],

    ["description", "Descrição", TextInputStyle.Paragraph,
      event?.description || "", "Informações do evento", false],

    ["classes", "Emojis e nomes das classes", TextInputStyle.Paragraph,
      event
        ? event.classes.map(c => `${c.emoji} | ${c.name}`).join("\n")
        : defaultClasses,
      "emoji | nome (uma classe por linha)", true]
  ];

  for (const [
    id, label, style, value, placeholder, required
  ] of fields) {
    const input = new TextInputBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setStyle(style)
      .setRequired(required)
      .setMaxLength(
        id === "description" || id === "classes" ? 1000 : 100
      )
      .setPlaceholder(placeholder);

    if (value) input.setValue(value.slice(0, 1000));

    modal.addComponents(
      new ActionRowBuilder().addComponents(input)
    );
  }

  return modal;
}

// FORMULÁRIO DE CONFIGURAÇÃO
function buildSettingsModal() {
  const modal = new ModalBuilder()
    .setCustomId("settings_modal")
    .setTitle("Configurar classes");

  const input = new TextInputBuilder()
    .setCustomId("classes")
    .setLabel("Emojis e nomes padrão")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000)
    .setValue(
      settings.classes
        .map(c => `${c.emoji} | ${c.name}`)
        .join("\n")
    )
    .setPlaceholder("💚 | HEALER\n🛡️ | TANK\n⚔️ | DPS");

  modal.addComponents(
    new ActionRowBuilder().addComponents(input)
  );

  return modal;
}

function validDateTime(date, time) {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(date)) return false;

  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return false;
  }

  const [d, m, y] = date.split("/").map(Number);

  const check = new Date(y, m - 1, d);

  return (
    check.getFullYear() === y &&
    check.getMonth() === m - 1 &&
    check.getDate() === d
  );
}

// ATUALIZAR MENSAGEM
async function refreshEvent(event) {
  try {
    const channel = await client.channels.fetch(event.channelId);

    if (!channel || !channel.isTextBased()) return;

    const message = await channel.messages.fetch(event.messageId);

    await message.edit({
      embeds: [makeEventEmbed(event)],
      components: makeEventComponents(event)
    });
  } catch (error) {
    console.error("Erro ao atualizar evento:", error.message);
  }
}

// AVISOS AUTOMÁTICOS
async function checkEventNotifications() {
  const now = Math.floor(Date.now() / 1000);

  for (const event of Object.values(events)) {
    if (event.noticeSent) continue;

    const eventTime = getEventTimestamp(event.date, event.time);
    const difference = eventTime - now;

    // Avisar quando faltar 30 minutos ou menos,
    // desde que o evento ainda não tenha começado.
    if (difference > 0 && difference <= 30 * 60) {
      const userIds = [
        ...new Set(
          event.classes.flatMap(cls => cls.users || [])
        )
      ];

      try {
        const channel = await client.channels.fetch(event.channelId);

        if (!channel || !channel.isTextBased()) continue;

        const mentions = userIds.map(id => `<@${id}>`).join(" ");

        const embed = new EmbedBuilder()
          .setColor(0xffa500)
          .setTitle("⏰ EVENTO COMEÇANDO EM BREVE!")
          .setDescription(
            `**${event.title}**\n\n` +
            `📅 ${event.date} às ${event.time}\n` +
            "⏳ Faltam aproximadamente 30 minutos!\n\n" +
            (mentions || "Nenhum jogador inscrito.")
          )
          .setTimestamp();

        await channel.send({
          embeds: [embed],
          allowedMentions: {
            users: userIds
          }
        });

        event.noticeSent = true;
        event.noticeSentAt = new Date().toISOString();

        saveData();

        console.log(`Aviso enviado: ${event.title}`);

      } catch (error) {
        console.error(
          `Erro no aviso do evento ${event.title}:`,
          error.message
        );
      }
    }
  }
}

// INTERAÇÕES
client.on("interactionCreate", async interaction => {
  try {

    // COMANDO PAINEL
    if (
      interaction.isChatInputCommand() &&
      interaction.commandName === "painel"
    ) {
      if (!interaction.memberPermissions?.has(
        PermissionFlagsBits.ManageGuild
      )) {
        return interaction.reply({
          content: "Você precisa ser administrador.",
          ephemeral: true
        });
      }

      await interaction.channel.send(makePanel());

      return interaction.reply({
        content: "Painel publicado!",
        ephemeral: true
      });
    }

    // CRIAR EVENTO
    if (
      interaction.isButton() &&
      interaction.customId === "event_create"
    ) {
      return interaction.showModal(
        buildModal("event_modal:new")
      );
    }

    // CONFIGURAR CLASSES
    if (
      interaction.isButton() &&
      interaction.customId === "event_settings"
    ) {
      if (!interaction.memberPermissions?.has(
        PermissionFlagsBits.ManageGuild
      )) {
        return interaction.reply({
          content: "Somente administradores podem configurar as classes.",
          ephemeral: true
        });
      }

      return interaction.showModal(buildSettingsModal());
    }

    // SALVAR CONFIGURAÇÕES
    if (
      interaction.isModalSubmit() &&
      interaction.customId === "settings_modal"
    ) {
      if (!interaction.memberPermissions?.has(
        PermissionFlagsBits.ManageGuild
      )) {
        return interaction.reply({
          content: "Você não tem permissão para alterar as classes.",
          ephemeral: true
        });
      }

      try {
        const classes = parseClasses(
          interaction.fields.getTextInputValue("classes")
        );

        settings.classes = classes.map(c => ({
          emoji: c.emoji,
          name: c.name
        }));

        saveSettings();

        return interaction.reply({
          content: "⚙️ Classes e emojis salvos! Eles serão usados nos próximos eventos.",
          ephemeral: true
        });

      } catch (error) {
        return interaction.reply({
          content: error.message,
          ephemeral: true
        });
      }
    }

    // ENTRAR EM CLASSE
    if (
      interaction.isButton() &&
      interaction.customId.startsWith("join:")
    ) {
      const [, eventId, classIndexText] =
        interaction.customId.split(":");

      const event = events[eventId];
      const classIndex = Number(classIndexText);

      if (!event || !event.classes[classIndex]) {
        return interaction.reply({
          content: "Evento não encontrado.",
          ephemeral: true
        });
      }

      for (const cls of event.classes) {
        cls.users = cls.users.filter(
          id => id !== interaction.user.id
        );
      }

      event.classes[classIndex].users.push(
        interaction.user.id
      );

      saveData();
      await refreshEvent(event);

      return interaction.reply({
        content:
          `Inscrição confirmada: ${event.classes[classIndex].emoji} ${event.classes[classIndex].name}.`,
        ephemeral: true
      });
    }

    // SAIR DO EVENTO
    if (
      interaction.isButton() &&
      interaction.customId.startsWith("leave:")
    ) {
      const eventId = interaction.customId.split(":")[1];
      const event = events[eventId];

      if (!event) {
        return interaction.reply({
          content: "Evento não encontrado.",
          ephemeral: true
        });
      }

      for (const cls of event.classes) {
        cls.users = cls.users.filter(
          id => id !== interaction.user.id
        );
      }

      saveData();
      await refreshEvent(event);

      return interaction.reply({
        content: "Você saiu do evento.",
        ephemeral: true
      });
    }

    // EDITAR EVENTO
    if (
      interaction.isButton() &&
      interaction.customId.startsWith("edit:")
    ) {
      const eventId = interaction.customId.split(":")[1];
      const event = events[eventId];

      if (!event) {
        return interaction.reply({
          content: "Evento não encontrado.",
          ephemeral: true
        });
      }

      const isAdmin = interaction.memberPermissions?.has(
        PermissionFlagsBits.ManageGuild
      );

      if (
        interaction.user.id !== event.createdBy &&
        !isAdmin
      ) {
        return interaction.reply({
          content: "Somente o criador ou administrador pode editar.",
          ephemeral: true
        });
      }

      return interaction.showModal(
        buildModal(`event_modal:${eventId}`, event)
      );
    }

    // SALVAR EVENTO
    if (
      interaction.isModalSubmit() &&
      interaction.customId.startsWith("event_modal:")
    ) {
      const eventId = interaction.customId.split(":")[1];

      const title = interaction.fields
        .getTextInputValue("title").trim();

      const date = interaction.fields
        .getTextInputValue("date").trim();

      const time = interaction.fields
        .getTextInputValue("time").trim();

      const description = interaction.fields
        .getTextInputValue("description").trim();

      if (!validDateTime(date, time)) {
        return interaction.reply({
          content: "Data ou horário inválido. Use DD/MM/AAAA e HH:MM.",
          ephemeral: true
        });
      }

      let classes;

      try {
        classes = parseClasses(
          interaction.fields.getTextInputValue("classes")
        );
      } catch (error) {
        return interaction.reply({
          content: error.message,
          ephemeral: true
        });
      }

      // NOVO EVENTO
      if (eventId === "new") {
        const id = `${Date.now()}-${interaction.user.id}`;

        const event = {
          id,
          title,
          date,
          time,
          description,
          classes,
          createdBy: interaction.user.id,
          createdByName: interaction.user.username,
          createdAt: new Date().toISOString(),
          channelId: interaction.channelId,
          messageId: null,
          noticeSent: false
        };

        const message = await interaction.channel.send({
          embeds: [makeEventEmbed(event)],
          components: makeEventComponents(event)
        });

        event.messageId = message.id;

        events[id] = event;

        saveData();

        return interaction.reply({
          content: "Evento criado e publicado com sucesso!",
          ephemeral: true
        });
      }

      // EDITAR EVENTO EXISTENTE
      const event = events[eventId];

      if (!event) {
        return interaction.reply({
          content: "Evento não encontrado.",
          ephemeral: true
        });
      }

      const oldDate = event.date;
      const oldTime = event.time;
      const oldClasses = event.classes;

      classes = classes.map(newClass => {
        const old = oldClasses.find(
          c => c.name.toLowerCase() ===
            newClass.name.toLowerCase()
        );

        return {
          ...newClass,
          users: old ? old.users : []
        };
      });

      Object.assign(event, {
        title,
        date,
        time,
        description,
        classes
      });

      // Se mudar data ou horário, permitir novo aviso.
      if (oldDate !== date || oldTime !== time) {
        event.noticeSent = false;
        delete event.noticeSentAt;
      }

      saveData();
      await refreshEvent(event);

      return interaction.reply({
        content: "Evento atualizado!",
        ephemeral: true
      });
    }

  } catch (error) {
    console.error(error);

    const message =
      "Ocorreu um erro ao processar. Confira os dados e tente novamente.";

    if (interaction.isRepliable()) {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: message,
          ephemeral: true
        }).catch(() => {});
      } else {
        await interaction.reply({
          content: message,
          ephemeral: true
        }).catch(() => {});
      }
    }
  }
});

// SERVIDOR RENDER
const app = express();

app.get("/", (_req, res) =>
  res.send("Albion Contents Bot online.")
);

app.get("/health", (_req, res) =>
  res.status(200).send("ok")
);

app.listen(PORT, () =>
  console.log(`Servidor HTTP ativo na porta ${PORT}.`)
);

// INICIALIZAÇÃO
client.once("clientReady", async () => {
  console.log(`Bot conectado como ${client.user.tag}`);

  try {
    await registerCommands();
  } catch (error) {
    console.error("Erro ao registrar comandos:", error);
  }

  // Verificar avisos a cada 30 segundos.
  setInterval(checkEventNotifications, 30 * 1000);

  // Verificar imediatamente ao iniciar.
  checkEventNotifications();
});

client.login(TOKEN);
