const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionsBitField
} = require('discord.js');

const fs = require('fs');
const schedule = require('node-schedule');

// ✅ APENAS TOKEN (MODIFICAÇÃO)
const TOKEN = process.env.TOKEN;

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// ================= DATABASE
let eventos = fs.existsSync('eventos.json')
    ? JSON.parse(fs.readFileSync('eventos.json'))
    : {};

function salvar() {
    fs.writeFileSync('eventos.json', JSON.stringify(eventos, null, 2));
}

// ================= EMBED
function criarEmbed(evento) {
    let desc = `🕒 **${evento.hora}**\n🆔 ID: ${evento.id}\n\n`;

    for (let classe of evento.classes) {
        const lista = evento.players[classe]?.length
            ? evento.players[classe].join("\n")
            : "-";

        desc += `${evento.emojis[classe] || "❔"} **${classe}**\n${lista}\n\n`;
    }

    return new EmbedBuilder()
        .setTitle(`📢 ${evento.nome}`)
        .setDescription(desc)
        .setFooter({ text: `👑 Líder: ${evento.autorNome}` })
        .setColor("Gold");
}

// ================= BOTÕES
function criarBotoes(evento) {
    const rows = [];
    let row = new ActionRowBuilder();

    evento.classes.forEach((classe, i) => {
        if (i % 5 === 0 && i !== 0) {
            rows.push(row);
            row = new ActionRowBuilder();
        }

        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`join_${evento.id}_${classe}`)
                .setLabel(classe)
                .setEmoji(evento.emojis[classe])
                .setStyle(ButtonStyle.Primary)
        );
    });

    row.addComponents(
        new ButtonBuilder()
            .setCustomId(`sair_${evento.id}`)
            .setLabel("Sair")
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId(`cancelar_${evento.id}`)
            .setLabel("Cancelar")
            .setStyle(ButtonStyle.Danger)
    );

    rows.push(row);
    return rows;
}

// ================= PING (SEM CARGO)
function agendar(evento) {
    const [h, m] = evento.hora.split(":");

    const data = new Date();
    data.setHours(h);
    data.setMinutes(m - 10);

    schedule.scheduleJob(data, async () => {
        try {
            const ch = await client.channels.fetch(evento.channelId);
            ch.send(`⏰ ${evento.nome} começa em 10 minutos!`);
        } catch {}
    });
}

// ================= INTERAÇÕES
client.on('interactionCreate', async (interaction) => {

    if (interaction.isChatInputCommand()) {

        // CRIAR EVENTO
        if (interaction.commandName === "evento") {

            const nome = interaction.options.getString("nome");
            const hora = interaction.options.getString("hora");
            const classesInput = interaction.options.getString("classes");

            const classes = classesInput
                .split(",")
                .map(c => c.trim().toLowerCase());

            let players = {};
            let emojis = {};

            classes.forEach(c => {
                players[c] = [];
                emojis[c] = c;
            });

            const evento = {
                id: Date.now().toString(),
                nome,
                hora,
                classes,
                players,
                emojis,
                channelId: interaction.channel.id,
                autorId: interaction.user.id,
                autorNome: interaction.user.username
            };

            const msg = await interaction.reply({
                embeds: [criarEmbed(evento)],
                components: criarBotoes(evento),
                fetchReply: true
            });

            evento.messageId = msg.id;
            eventos[evento.id] = evento;

            salvar();
            agendar(evento);
        }

        // EDITAR
        if (interaction.commandName === "editar") {

            const id = interaction.options.getString("id");
            const novaHora = interaction.options.getString("hora");

            const evento = eventos[id];
            if (!evento) return interaction.reply("❌ Evento não encontrado");

            const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

            if (evento.autorId !== interaction.user.id && !isAdmin) {
                return interaction.reply({
                    content: "❌ Apenas líder ou ADM pode editar",
                    ephemeral: true
                });
            }

            evento.hora = novaHora;
            salvar();

            const ch = await client.channels.fetch(evento.channelId);
            const msg = await ch.messages.fetch(evento.messageId);

            msg.edit({ embeds: [criarEmbed(evento)] });

            interaction.reply("✅ Evento atualizado!");
        }
    }

    // BOTÕES
    if (interaction.isButton()) {

        const parts = interaction.customId.split("_");
        const action = parts[0];
        const eventoId = parts[1];
        const classe = parts[2];

        const evento = eventos[eventoId];
        if (!evento) return;

        const user = interaction.user.username;

        evento.classes.forEach(c => {
            evento.players[c] = evento.players[c].filter(p => p !== user);
        });

        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

        if (action === "cancelar") {

            if (evento.autorId !== interaction.user.id && !isAdmin) {
                return interaction.reply({
                    content: "❌ Só líder ou ADM pode cancelar",
                    ephemeral: true
                });
            }

            delete eventos[evento.id];
            salvar();

            return interaction.update({
                content: "❌ Evento cancelado",
                embeds: [],
                components: []
            });
        }

        if (action !== "sair") {
            evento.players[classe].push(user);
        }

        salvar();

        interaction.update({
            embeds: [criarEmbed(evento)],
            components: criarBotoes(evento)
        });
    }
});

client.once('ready', () => {
    console.log("🔥 BOT ONLINE!");
});

client.login(TOKEN)
  .then(() => console.log("🔑 Login realizado"))
  .catch(err => console.error("❌ ERRO LOGIN:", err));

// ===== SERVIDOR PRA RENDER
const PORT = process.env.PORT || 3000;

require('http')
  .createServer((req, res) => {
    res.writeHead(200);
    res.end("Bot rodando!");
  })
  .listen(PORT, () => console.log(`🌐 Porta ${PORT} ativa`));
