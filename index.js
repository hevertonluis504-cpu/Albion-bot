const { Client, Intents } = require('discord.js');
const { Player } = require('discord-player');

const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_VOICE_STATES, Intents.FLAGS.GUILD_MESSAGES] });
const player = new Player(client);

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async message => {
    if (message.content.startsWith('!play')) {
        const args = message.content.split(' ').slice(1);
        const voiceChannel = message.member.voice.channel;

        if (!voiceChannel) return message.reply('You need to be in a voice channel to play music!');
        const permissions = voiceChannel.permissionsFor(message.client.user);
        if (!permissions.has('CONNECT') || !permissions.has('SPEAK')) {
            return message.reply('I need permissions to join and speak in your voice channel!');
        }

        const searchQuery = args.join(' ');
        const track = await player.search(searchQuery, { requestedBy: message.author }).then(x => x.tracks[0]);

        if (!track) return message.reply('No results found!');

        // Join the voice channel and play the track
        const queue = player.createQueue(message.guild, { metadata: { channel: message.channel } });

        try {
            // Connect to the voice channel
            await queue.connect(voiceChannel);
            message.reply(`🎶 Now playing **${track.title}**`);
        } catch (error) {
            console.error(error);
            queue.destroy();
            return message.channel.send('Could not join your voice channel!');
        }

        queue.play(track);
    }
});

client.on('voiceStateUpdate', (oldState, newState) => {
    const queue = player.getQueue(newState.guild);
    // If the bot is in the voice channel and nobody is listening
    if (queue && !newState.channel) {
        queue.destroy();
        console.log('Left the voice channel because nobody is listening.');
    }
});

client.login('YOUR_BOT_TOKEN');