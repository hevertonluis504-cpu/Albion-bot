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

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.on("error", console.error);

const groups = new Map();

function saveGroups() {
  try {
    const data = Object.fromEntries(groups);
    fs.writeFileSync('./groups.json', JSON.stringify(data, null, 2));
    console.log(`[Sistema] Grupos salvos com sucesso. Total: ${groups.size}`);
  } catch (e) {
    console.error("Erro ao salvar grupos:", e);
  }
}

function loadGroups() {
  try {
    if (fs.existsSync('./groups.json')) {
      const data = JSON.parse(fs.readFileSync('./groups.json', 'utf8'));
      for (const id in data) {
        data[id].startDate = new Date(data[id].startDate);
        groups.set(id, data[id]);
      }
      console.log(`[Sistema] ${groups.size} grupos carregados do arquivo.`);
    }
  } catch (e) {
    console.error("Erro ao carregar grupos:", e);
  }
}

function getEmoji(roleName){
  const name = roleName.toLowerCase();
  if(name.includes("tank")) return "🛡️";
  if(name.includes("heal")) return "💉";
  if(name.includes("dps")) return "🔥";
  if(name.includes("debuff")) return "🌀";
  if(name.includes("arcano")) return "✨";
  if(name.includes("suporte")) return "🧩";
  return "⚔️";
}

function parseDateTime(dateStr, timeStr) {
  const [d,m,y] = dateStr.split("/").map(Number);
  const [h,min] = timeStr.split(":").map(Number);
  return new Date(Date.UTC(y, m-1, d, h + 3, min));
}

function formatDate(d){return d.toLocaleDateString("pt-BR",{timeZone:"America/Sao_Paulo"});}
function formatTime(d){return d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit",timeZone:"America/Sao_Paulo"});}

function timeUntil(d){
  const diff=d-new Date();
  if(diff<=0) return "🚀 Já começou";
  const m=Math.floor(diff/60000);
  const h=Math.floor(m/60);
  const r=m%60;
  if(h===0) return `${r}min`;
  if(r===0) return `${h}h`;
  return `${h}h ${r}min`;
}

function parseRoles(input){
  const roles={};
  const parts=input.split(",");
  for(const p of parts){
    const match=p.trim().match(/^(\d+)\s+(.+)$/);
    if(match){
      const qty=parseInt(match[1]);
      const name=match[2].trim();
      roles[name]={ name, limit: qty };
    }
  }
  return roles;
}

function buildEmbed(group){
  const e=new EmbedBuilder()
    .setTitle(`⚔️ ${group.title}`)
    .setColor(0x5865F2)
    .setDescription(
      `📅 Data: ${formatDate(group.startDate)}\n` +
      `🕒 Início: ${formatTime(group.startDate)} UTC-3\n` +
      `⏳ Começa em: ${timeUntil(group.startDate)}\n` +
      `📝 ${group.description}\n\n` +
      `👥 **Total de Jogadores: ${group.total}**`
    );

  for(const key in group.roles){
    const role=group.roles[key];
    const emoji=getEmoji(role.name);
    const users=group.members[key].map(u=>`<@${u.id}>`).join("\n")||"—";
    e.addFields({
      name:`${emoji} ${role.name} (${group.members[key].length}/${role.limit})`,
      value:users,
      inline:true
    });
  }

  return e;
}

function buildButtons(group){
  const rows = [];
  let currentRow = new ActionRowBuilder();
  const allButtons = [];

  for(const key in group.roles){
    const role=group.roles[key];
    const emoji=getEmoji(role.name);

    allButtons.push(
      new ButtonBuilder()
        .setCustomId("join_"+key)
        .setLabel(`${emoji} ${role.name}`)
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

  if (currentRow.components.length > 0 && rows.length < 5) {
    rows.push(currentRow);
  }

  return rows;
}

client.once(Events.ClientReady, async () => {
  console.log(`Bot online como ${client.user.tag}`);
  loadGroups();
  
  const commands = [
    new SlashCommandBuilder()
      .setName("criar")
      .setDescription("Criar grupo de conteúdo")
      .addStringOption(o=>o.setName("tipo").setDescription("Tipo do conteúdo").setRequired(true))
      .addIntegerOption(o=>o.setName("jogadores").setDescription("Total de jogadores").setRequired(true))
      .addStringOption(o=>o.setName("classes").setDescription("Ex: 1 Tank, 2 Healer, 3 DPS").setRequired(true))
      .addStringOption(o=>o.setName("data").setDescription("DD/MM/AAAA").setRequired(true))
      .addStringOption(o=>o.setName("horario").setDescription("HH:MM UTC-3").setRequired(true))
      .addStringOption(o=>o.setName("descricao").setDescription("Descrição")),
    new SlashCommandBuilder()
      .setName("divisao")
      .setDescription("Calcular divisão de loot")
      .addIntegerOption(o=>o.setName("loot").setDescription("Valor total do loot").setRequired(true))
      .addIntegerOption(o=>o.setName("jogadores").setDescription("Quantidade de jogadores (opcional se usar menções)").setRequired(false))
      .addStringOption(o=>o.setName("mencoes").setDescription("Mencione os jogadores (ex: @user1 @user2)").setRequired(false))
  ].map(c => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("Comandos registrados com sucesso!");
  } catch (error) {
    console.error("Erro ao registrar comandos:", error);
  }
});

client.on("interactionCreate",async i=>{
  try {

  if(i.isChatInputCommand() && i.commandName==="criar"){

      const tipo=i.options.getString("tipo");
      const jogadores=i.options.getInteger("jogadores");
      const classes=i.options.getString("classes");
      const data=i.options.getString("data");
      const horario=i.options.getString("horario");
      const desc=i.options.getString("descricao")||"Sem descrição";

      const roles=parseRoles(classes);
      if(Object.keys(roles).length === 0){
        console.log(`Falha ao processar classes: "${classes}"`);
        return i.reply({ content: "❌ Formato de classes inválido! Use: `1 Tank, 2 Healer, 3 DPS`", ephemeral: true });
      }

      const members={};
      for(const r in roles) members[r]=[];

      const group={
        title: tipo,
        total: jogadores,
        roles,
        members,
        description: desc,
        startDate: parseDateTime(data,horario),
        creatorId: i.user.id
      };

      const response = await i.reply({
        embeds:[buildEmbed(group)],
        components:buildButtons(group),
        fetchReply: true
      });

      groups.set(response.id, group);
      console.log(`[Sistema] Novo grupo criado: ${group.title} (ID: ${response.id})`);
      saveGroups();
      return;
  }

  if(i.isChatInputCommand() && i.commandName==="divisao"){
      const loot = i.options.getInteger("loot");
      let jogadores = i.options.getInteger("jogadores");
      const mencoes = i.options.getString("mencoes");
      
      let listaMencoes = "";
      if (mencoes) {
          const matches = mencoes.match(/<@&?!?\d+>/g);
          if (matches) {
              if (!jogadores) jogadores = matches.length;
              listaMencoes = matches.join(" ");
          }
      }

      if (!jogadores || jogadores <= 0) {
          return i.reply({ content: "❌ Você precisa informar a quantidade de jogadores ou mencionar os participantes!", ephemeral: true });
      }

      const resultado = Math.floor(loot / jogadores);
      
      const embed = new EmbedBuilder()
        .setTitle("💰 Divisão de Loot")
        .setColor(0x00FF00)
        .addFields(
          { name: "💰 Total Loot", value: `${loot.toLocaleString('pt-BR')}`, inline: true },
          { name: "👥 Jogadores", value: `${jogadores}`, inline: true },
          { name: "💎 Cada um recebe", value: `${resultado.toLocaleString('pt-BR')}`, inline: false }
        );

      if (listaMencoes) {
          embed.addFields({ name: "👤 Participantes", value: listaMencoes, inline: false });
      }

      return i.reply({ embeds: [embed] });
  }

  if(i.isButton()){
    const group=groups.get(i.message.id);
    if(!group) {
      console.log(`[Aviso] Tentativa de interação em grupo não encontrado: ${i.message.id}`);
      return i.reply({content:"❌ Este evento expirou ou o bot foi reiniciado e os dados foram perdidos. Por favor, crie um novo evento.", ephemeral:true});
    }

    if(i.customId === "ping_all") {
      const mentions = [];
      for(const r in group.members) {
        group.members[r].forEach(u => mentions.push(`<@${u.id}>`));
      }
      
      if(mentions.length === 0) return i.reply({ content: "Ninguém no grupo para pingar!", ephemeral: true });
      
      return i.reply({ 
        content: `🔔 **Chamada para o grupo:** ${mentions.join(" ")}`, 
        allowedMentions: { users: mentions.map(m => m.replace(/[^0-9]/g, '')) } 
      });
    }

    if(i.customId === "edit_group") {
      if(i.user.id !== group.creatorId) {
        return i.reply({ content: "Apenas o criador do grupo pode editar as informações!", ephemeral: true });
      }

      const modal = new ModalBuilder()
        .setCustomId('modal_edit')
        .setTitle('Editar Grupo');

      const titleInput = new TextInputBuilder()
        .setCustomId('edit_title')
        .setLabel("Título do Conteúdo")
        .setStyle(TextInputStyle.Short)
        .setValue(group.title)
        .setRequired(true);

      const descInput = new TextInputBuilder()
        .setCustomId('edit_desc')
        .setLabel("Descrição")
        .setStyle(TextInputStyle.Paragraph)
        .setValue(group.description)
        .setRequired(true);

      const dateTimeInput = new TextInputBuilder()
        .setCustomId('edit_datetime')
        .setLabel("Data e Hora (DD/MM/AAAA HH:MM)")
        .setStyle(TextInputStyle.Short)
        .setValue(`${formatDate(group.startDate)} ${formatTime(group.startDate)}`)
        .setRequired(true);

      const totalInput = new TextInputBuilder()
        .setCustomId('edit_total')
        .setLabel("Total de Jogadores")
        .setStyle(TextInputStyle.Short)
        .setValue(group.total.toString())
        .setRequired(true);

      const rolesInput = new TextInputBuilder()
        .setCustomId('edit_roles')
        .setLabel("Classes (Ex: 1 Tank, 2 Healer)")
        .setStyle(TextInputStyle.Short)
        .setValue(Object.values(group.roles).map(r => `${r.limit} ${r.name}`).join(", "))
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(descInput),
        new ActionRowBuilder().addComponents(dateTimeInput),
        new ActionRowBuilder().addComponents(totalInput),
        new ActionRowBuilder().addComponents(rolesInput)
      );

      return i.showModal(modal);
    }

    const user=i.user;

    if(i.customId==="leave"){
      for(const r in group.members)
        group.members[r]=group.members[r].filter(u=>u.id!==user.id);

      await i.update({
        embeds:[buildEmbed(group)],
        components:buildButtons(group)
      });
      saveGroups();
      return;
    }

    const role=i.customId.replace("join_","");

    if(group.members[role].some(u=>u.id===user.id))
      return i.reply({content:"Você já está nesta função!",ephemeral:true});

    if(group.members[role].length>=group.roles[role].limit)
      return i.reply({content:"Função cheia",ephemeral:true});

    // Remove de outras funções para permitir a troca
    for(const r in group.members)
      group.members[r]=group.members[r].filter(u=>u.id!==user.id);

    group.members[role].push(user);

    await i.update({
      embeds:[buildEmbed(group)],
      components:buildButtons(group)
    });
    saveGroups();
    return;
  }

  if (i.isModalSubmit() && i.customId === 'modal_edit') {
    const group = groups.get(i.message.id);
    if (!group) return i.reply({ content: "Grupo não encontrado.", ephemeral: true });

    const newTitle = i.fields.getTextInputValue('edit_title');
    const newDesc = i.fields.getTextInputValue('edit_desc');
    const newDateTime = i.fields.getTextInputValue('edit_datetime');
    const newTotal = parseInt(i.fields.getTextInputValue('edit_total'));
    const newRolesStr = i.fields.getTextInputValue('edit_roles');

    try {
      const [d, t] = newDateTime.split(" ");
      const newRoles = parseRoles(newRolesStr);
      if(Object.keys(newRoles).length === 0) throw new Error("Roles inválidas");

      const newMembers = {};
      for(const r in newRoles) {
        // Tenta manter os membros se a role ainda existir
        newMembers[r] = group.members[r] || [];
      }

      group.title = newTitle;
      group.description = newDesc;
      group.startDate = parseDateTime(d, t);
      group.roles = newRoles;
      group.members = newMembers;
      group.total = isNaN(newTotal) ? group.total : newTotal;

      await i.update({
        embeds: [buildEmbed(group)],
        components: buildButtons(group)
      });
      saveGroups();
      return;
    } catch (e) {
      return i.reply({ content: "Erro ao atualizar: Verifique o formato da data (DD/MM/AAAA) e hora (HH:MM).", ephemeral: true });
    }
  }

  } catch (error) {
    console.error("Erro na interação:", error);
    if (!i.replied && !i.deferred) {
      await i.reply({ content: "Ocorreu um erro ao processar essa ação.", ephemeral: true }).catch(() => {});
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
