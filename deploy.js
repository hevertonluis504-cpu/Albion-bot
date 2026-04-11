const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = "1492609502342549616";

const commands = [
    new SlashCommandBuilder()
        .setName('evento')
        .setDescription('Criar evento')
        .addStringOption(o => o.setName('nome').setRequired(true))
        .addStringOption(o => o.setName('hora').setRequired(true))
        .addStringOption(o => o.setName('classes').setRequired(true)),

    new SlashCommandBuilder()
        .setName('editar')
        .setDescription('Editar evento')
        .addStringOption(o => o.setName('id').setRequired(true))
        .addStringOption(o => o.setName('hora').setRequired(true))
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    await rest.put(
        Routes.applicationCommands(CLIENT_ID),
        { body: commands }
    );

    console.log("✅ Comandos registrados!");
})();
