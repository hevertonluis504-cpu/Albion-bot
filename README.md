# Albion Contents — Bot de eventos para Discord

Bot em Node.js + Discord.js, preparado para deploy no Render.

## O que ele faz

- `/painel` publica o painel permanente com o botão **Criar Evento**.
- O formulário permite preencher título, data, horário, descrição e classes.
- As classes são totalmente personalizáveis em cada evento.
- Cada linha de classe usa o formato `emoji | nome`.
- O bot cria um botão por classe, além de **Sair** e **Editar**.
- Ao clicar em uma classe, o usuário entra nela. Se já estiver em outra classe, a inscrição anterior é removida.
- Quem criou o evento ou um administrador pode editá-lo.
- As inscrições são mantidas quando o evento é editado, desde que o nome da classe continue igual.

## Como preencher as classes

No formulário, coloque uma classe por linha:

```text
💚 | HEALER
🛡️ | TANK
⚔️ | DPSs
🏹 | ARQUEIRO
```

Você pode usar seus próprios emojis e nomes. O limite atual é de 20 classes por evento.

## 1. Criar o bot no Discord

1. Acesse https://discord.com/developers/applications
2. Crie uma aplicação e adicione um Bot.
3. Copie o token do bot.
4. Em OAuth2 > URL Generator, marque `bot` e `applications.commands`.
5. Em permissões do bot, marque pelo menos `View Channels`, `Send Messages`, `Embed Links` e `Read Message History`.
6. Abra o link gerado e convide o bot para seu servidor.

**Nunca compartilhe o token do bot.** Se ele vazar, gere outro no Developer Portal.

## 2. Publicar no Render

1. Envie esta pasta para um repositório GitHub.
2. No Render, escolha **New > Blueprint** e conecte o repositório (ou crie um Web Service com `npm install` e `npm start`).
3. Configure as variáveis:
   - `DISCORD_TOKEN`: token do bot
   - `CLIENT_ID`: Application ID da aplicação
   - `GUILD_ID`: ID do servidor Discord
4. Faça o deploy.
5. Quando o bot conectar, o comando `/painel` será registrado no servidor indicado em `GUILD_ID`.
6. No Discord, use `/painel` em um canal onde o bot possa enviar mensagens.

## Importante sobre o Render gratuito

O serviço Web gratuito do Render pode entrar em suspensão após um período sem tráfego. Quando isso acontecer, o bot pode ficar offline até o serviço voltar a iniciar. Além disso, o disco do serviço gratuito é efêmero: o arquivo `data/events.json` pode ser perdido em reinicializações ou novos deploys.

Para manter o bot 24 horas online e preservar inscrições de forma confiável, use hospedagem que mantenha processos continuamente ativos e armazenamento persistente, ou conecte um banco de dados externo. Não considere o armazenamento local deste projeto como backup permanente.

## Limites e observações

- Data: `DD/MM/AAAA`
- Horário: `HH:MM` no formato de 24 horas
- Até 20 classes por evento (limite de componentes do Discord: 25 por mensagem)
- A descrição pode ter até 1000 caracteres.
- O painel pode ser publicado novamente com `/painel` se precisar de outro painel.
