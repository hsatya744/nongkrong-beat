require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { Player } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');

// 1. Inisialisasi Client Discord dengan Intent yang diperlukan
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// 2. Inisialisasi Discord Player
const player = new Player(client);

// Memuat extractor bawaan secara aman
async function initPlayer() {
    await player.extractors.loadMulti(DefaultExtractors);
}
initPlayer();

// Event listeners untuk menangani error audio secara halus
player.events.on('error', (queue, error) => {
    console.error(`[Error Queue] Ada kendala pada antrean: ${error.message}`);
});

player.events.on('playerError', (queue, error, track) => {
    console.error(`[Player Error] Gagal memutar lagu ${track?.title || 'Unknown'}: ${error.message}`);
    if (queue && queue.metadata) {
        queue.metadata.channel.send(`⚠️ Terjadi gangguan koneksi saat memutar **${track?.title}**. Mencoba melanjutkan...`);
    }
});

client.once('ready', () => {
    console.log(`🤖 Bot Musik online sebagai ${client.user.tag}!`);
});

// 3. Event Listener untuk Perintah Teks
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const prefix = '!';
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    const queue = player.nodes.get(message.guild.id);

    // Perintah !play atau !p
    if (command === 'play' || command === 'p') {
        const channel = message.member?.voice.channel;
        
        if (!channel) {
            return message.reply('❌ Anda harus masuk ke dalam sebuah *Voice Channel* terlebih dahulu!');
        }

        const query = args.join(' ');
        if (!query) {
            return message.reply('❌ Mohon masukkan judul lagu atau link yang ingin diputar! Contoh: `!play Tulus Teh Hijau`');
        }

        try {
            // Memutar lagu dengan opsi pemutaran instan (tanpa buffering tambahan)
            const { track } = await player.play(channel, query, {
                nodeOptions: {
                    metadata: message,
                    leaveOnEnd: false,
                    leaveOnEmpty: true,
                    leaveOnEmptyCooldown: 30000,   // 30 detik
                    bufferingTimeout: 0,           // 0ms agar langsung memutar stream audio instan
                    connectionTimeout: 10000,      // Timeout koneksi 10 detik
                    skipFFmpeg: true              // Melewati konversi audio berat agar pemutaran jauh lebih cepat
                }
            });

            await message.reply(`🎶 Sedang memutar: **${track.title}**`);
        } catch (error) {
            console.error(error);
            await message.reply('❌ Gagal memutar lagu. Coba cari menggunakan judul lagu lainnya!');
        }
    }

    // Perintah !skip atau !s
    else if (command === 'skip' || command === 's') {
        if (!queue || !queue.isPlaying()) {
            return message.reply('❌ Tidak ada lagu yang sedang diputar saat ini.');
        }

        queue.node.skip();
        await message.reply('⏭️ Lagu berhasil dilewati (*skipped*).');
    }

    // Perintah !stop
    else if (command === 'stop') {
        if (!queue || !queue.isPlaying()) {
            return message.reply('❌ Bot tidak sedang berada di *Voice Channel* atau memutar musik.');
        }

        queue.delete();
        await message.reply('⏹️ Musik dihentikan dan bot keluar dari *Voice Channel*.');
    }

    // Perintah !queue atau !q
    else if (command === 'queue' || command === 'q') {
        if (!queue || !queue.isPlaying()) {
            return message.reply('❌ Tidak ada antrean lagu saat ini.');
        }

        const currentTrack = queue.currentTrack;
        const tracks = queue.tracks.toArray();

        let queueString = `🎶 **Sedang Diputar:**\n1. **${currentTrack.title}**\n\n`;
        
        if (tracks.length > 0) {
            queueString += `📋 **Antrean Berikutnya:**\n`;
            tracks.slice(0, 10).forEach((track, index) => {
                queueString += `${index + 2}. **${track.title}**\n`;
            });
            if (tracks.length > 10) {
                queueString += `_...dan ${tracks.length - 10} lagu lainnya._`;
            }
        } else {
            queueString += `_Tidak ada lagu lain dalam antrean._`;
        }

        await message.reply(queueString);
    }

    // Perintah !pause
    else if (command === 'pause') {
        if (!queue || !queue.isPlaying()) {
            return message.reply('❌ Tidak ada musik yang sedang diputar.');
        }

        queue.node.pause();
        await message.reply('⏸️ Pemutaran musik berhasil dijeda.');
    }

    // Perintah !resume
    else if (command === 'resume') {
        if (!queue) {
            return message.reply('❌ Tidak ada antrean musik.');
        }

        queue.node.resume();
        await message.reply('▶️ Pemutaran musik dilanjutkan kembali.');
    }

    // Perintah !move
    else if (command === 'move') {
        if (!queue || queue.tracks.size === 0) {
            return message.reply('❌ Antrean lagu terlalu sedikit untuk dipindahkan.');
        }

        const fromIndex = parseInt(args[0]) - 1;
        const toIndex = parseInt(args[1]) - 1;

        if (isNaN(fromIndex) || isNaN(toIndex)) {
            return message.reply('❌ Format salah! Contoh penggunaan: `!move 3 1`');
        }

        const tracks = queue.tracks.toArray();

        if (fromIndex < 0 || fromIndex >= tracks.length || toIndex < 0 || toIndex >= tracks.length) {
            return message.reply('❌ Nomor urutan antrean tidak valid/tidak ditemukan.');
        }

        try {
            const trackToMove = tracks[fromIndex];
            queue.tracks.remove(trackToMove);
            queue.tracks.insert(trackToMove, toIndex);

            await message.reply(`🔀 Berhasil memindahkan **${trackToMove.title}** ke posisi nomor **${toIndex + 1}** dalam antrean.`);
        } catch (err) {
            console.error(err);
            await message.reply('❌ Gagal memindahkan posisi lagu.');
        }
    }
});

// 4. Token Bot Anda
client.login(process.env.DISCORD_TOKEN);