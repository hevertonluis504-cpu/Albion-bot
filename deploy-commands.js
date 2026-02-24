require("dotenv").config();
const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const commands = [

  // =====================
  // /CRIAR
  // =====================
  new SlashCommandBuilder()
    .setName("criar")
    .setDescription("Criar grupo de conteúdo")
    .addStringOption(o=>o.setName("tipo").setDescription("Tipo do conteúdo").setRequired(true))
    .addIntegerOption(o=>o.setName("jogadores").setDescription("Total de jogadores").setRequired(true))
    .addStringOption(o=>o.setName("classes").setDescription("Ex: 1 Tank, 2 Healer, 3 DPS").setRequired(true))
    .addStringOption(o=>o.setName("data").setDescription("DD/MM/AAAA").setRequired(true))
    .addStringOption(o=>o.setName("horario").setDescription("HH:MM UTC-3").setRequired(true))
    .addStringOption(o=>o.setName("descricao").setDescription("Descrição")),

  // =====================
  // /DIVISAO
  // =====================
  new SlashCommandBuilder()
    .setName("divisao")
    .setDescription("Dividir valor entre jogadores")
    .addIntegerOption(o=>o.setName("valor").setDescription("Valor total").setRequired(true))
    .addIntegerOption(o=>o.setName("pessoas").setDescription("Quantidade de pessoas").setRequired(true)),

  // =====================
  // /TOCAR
  // =====================
  new SlashCommandBuilder()
    .setName("tocar")
    .setDescription("Tocar música no canal de voz")
    .addStringOption(o=>o.setName("musica").setDescription("Nome ou link da música").setRequired(true))

].map(c=>c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async()=>{
  const app = await rest.get(Routes.oauth2CurrentApplication());

  // REGISTRO GLOBAL (pode demorar até 1h)
  await rest.put(
    Routes.applicationCommands(app.id),
    { body: commands }
  );

  console.log("Comandos registrados com sucesso!");
})();
