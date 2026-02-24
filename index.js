require("dotenv").config();
const fs = require("fs");
const { Player } = require("discord-player");
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
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ] 
});

// Inicializar o Player
const player = new Player(client, {
  ytdlOptions: {
    quality: "lowestaudio",
    highWaterMark: 1 << 25
  }
});

client.on("error", console.error);
player.extractors.loadDefault();

const groups = new Map();

// ==================== FUNÇÕES DE GRUPOS ====================

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
    const match=p.trim().match(/^(
\d+)
\s+(.+)$/);
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

// ==================== EVENTOS DO PLAYER ====================

player.on("trackStart", (queue, track) => {
  const embed = new EmbedBuilder()
    .setTitle("🎵 Tocando agora")
    .setDescription(`[${track.title}](${track.url})`)
    .setColor(0xFF0000)
    .addFields(
      { name: "👤 Artista", value: track.author || "Desconhecido", inline: true },
      { name: "⏱️ Duração", value: `${Math.floor(track.durationMS / 1000 / 60)}:${Math.floor((track.durationMS / 1000) % 60).toString().padStart(2, '0')}`, inline: true }
    );
  
  if(track.thumbnail) embed.setThumbnail(track.thumbnail);
  
  queue.metadata.channel.send({ embeds: [embed] }).catch(() => {});
});

player.on("queueEnd", (queue) => {
  queue.metadata.channel.send("✅ A fila de música acabou!").catch(() => {});
});

player.on("error", (queue, error) => {
  console.error("Erro no player:", error);
  queue.metadata.channel.send(`❌ Erro: ${error.message}`).catch(() => {});
});

player.on("channelEmpty", (queue) => {
  console.log(`[Música] Canal vazio. Bot saindo...`);
  queue.destroy();
});

// Verificar se há ouvintes na call
setInterval(() => {
  player.queues.forEach(queue => {
    const voiceChannel = queue.connection?.channel;
    if (!voiceChannel) return;

    const members = voiceChannel.members.filter(m => !m.user.bot).size;
    if (members === 0) {
      queue.metadata.channel.send("👋 Ninguém está ouvindo. Saindo da call...").catch(() => {});
      queue.destroy();
    }
  });
}, 10000);

// ==================== CLIENTE READY ====================

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
      .addStringOption(o=>o.setName("mencoes").setDescription("Mencione os jogadores (ex: @user1 @user2)").setRequired(false)),
    new SlashCommandBuilder()
      .setName("tocar")
      .setDescription("🎵 Toca uma música no canal de voz")
      .addStringOption(o=>o.setName("musica").setDescription("Nome ou URL da música").setRequired(true)),
    new SlashCommandBuilder()
      .setName("pause")
      .setDescription("⏸️ Pausa a música"),
    new SlashCommandBuilder()
      .setName("resume")
      .setDescription("▶️ Retoma a música"),
    new SlashCommandBuilder()
      .setName("skip")
      .setDescription("⏭️ Pula para a próxima música"),
    new SlashCommandBuilder()
      .setName("stop")
      .setDescription("⏹️ Para de tocar e limpa a fila"),
    new SlashCommandBuilder()
      .setName("fila")
      .setDescription("📋 Mostra a fila de músicas")
  ].map(c => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("Comandos registrados com sucesso!");
  } catch (error) {
    console.error("Erro ao registrar comandos:", error);
  }
});

// ==================== INTERACTIONS ====================

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

  // ==================== COMANDOS DE MÚSICA ====================

  if(i.isChatInputCommand() && i.commandName==="tocar"){ 
    await i.deferReply();

    const voiceChannel = i.member?.voice?.channel;
    if (!voiceChannel) {
      return i.editReply({ content: "❌ Você precisa estar em um canal de voz!" });
    }

    const musica = i.options.getString("musica");
    
    try {
      let queue = player.getQueue(i.guild);
      
      if (!queue) {
        queue = player.createQueue(i.guild, {
          metadata: {
            channel: i.channel,
            requestedBy: i.user
          }
        });
      }

      if (!queue.connection) await queue.connect(voiceChannel);

      const resultado = await player.search(musica, {
        requestedBy: i.user,
        searchEngine: "youtube"
      });

      if (!resultado || resultado.tracks.length === 0) {
        return i.editReply({ content: "❌ Nenhuma música encontrada para essa busca!" });
      }

      const track = resultado.tracks[0];
      queue.addTrack(track);

      const duracao = Math.floor(track.durationMS / 1000);
      const min = Math.floor(duracao / 60);
      const seg = duracao % 60;

      const embed = new EmbedBuilder()
        .setTitle("✅ Música adicionada à fila")
        .setDescription(`[${track.title}](${track.url})`)
        .setColor(0x00FF00)
        .addFields(
          { name: "👤 Artista", value: track.author || "Desconhecido", inline: true },
          { name: "⏱️ Duração", value: `${min}:${seg.toString().padStart(2, '0')}`, inline: true },
          { name: "📍 Posição na fila", value: `${queue.tracks.length}ª música`, inline: true }
        );

      if(track.thumbnail) embed.setThumbnail(track.thumbnail);

      if (!queue.playing) await queue.play();

      return i.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Erro ao tocar música:", error);
      return i.editReply({ content: `❌ Erro: ${error.message}` });
    }
  }

  if(i.isChatInputCommand() && i.commandName==="pause"){ 
    const queue = player.getQueue(i.guild);
    if (!queue || !queue.playing) {
      return i.reply({ content: "❌ Nenhuma música está tocando!", ephemeral: true });
    }
    queue.setPaused(true);
    return i.reply({ content: "⏸️ Música pausada!" });
  }

  if(i.isChatInputCommand() && i.commandName==="resume"){ 
    const queue = player.getQueue(i.guild);
    if (!queue) {
      return i.reply({ content: "❌ Nenhuma música está tocando!", ephemeral: true });
    }
    queue.setPaused(false);
    return i.reply({ content: "▶️ Música retomada!" });
  }

  if(i.isChatInputCommand() && i.commandName==="skip"){ 
    const queue = player.getQueue(i.guild);
    if (!queue || !queue.playing) {
      return i.reply({ content: "❌ Nenhuma música está tocando!", ephemeral: true });
    }
    queue.skip();
    return i.reply({ content: "⏭️ Pulando para a próxima música..." });
  }

  if(i.isChatInputCommand() && i.commandName==="stop"){ 
    const queue = player.getQueue(i.guild);
    if (!queue) {
      return i.reply({ content: "❌ Nenhuma fila ativa!", ephemeral: true });
    }
    queue.destroy();
    return i.reply({ content: "⏹️ Música parada e fila limpa!" });
  }

  if(i.isChatInputCommand() && i.commandName==="fila"){ 
    const queue = player.getQueue(i.guild);
    if (!queue || queue.tracks.length === 0) {
      return i.reply({ content: "❌ A fila está vazia!", ephemeral: true });
    }

    const tracks = queue.tracks.slice(0, 10);
    const description = tracks.map((track, index) => {
      const duracao = Math.floor(track.durationMS / 1000);
      const min = Math.floor(duracao / 60);
      const seg = duracao % 60;
      return `${index + 1}. [${track.title}](${track.url}) \
` +
`{min}:${seg.toString().padStart(2, '0')}`;
    }).join("\n");

    const embed = new EmbedBuilder()
      .setTitle("📋 Fila de Músicas")
      .setDescription(description || "Fila vazia")
      .setColor(0x5865F2)
      .setFooter({ text: `Total: ${queue.tracks.length} músicas na fila` });

    return i.reply({ embeds: [embed] });
  }

  // ==================== INTERAÇÕES COM BOTÕES ====================

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