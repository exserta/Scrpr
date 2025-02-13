import { Client } from 'discord.js-selfbot-v13';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import readlineSync from 'readline-sync';
import gradient from 'gradient-string';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const messagesDir = path.join(__dirname, 'messages');

if (!fs.existsSync(messagesDir)) {
    fs.mkdirSync(messagesDir);
}

const config = JSON.parse(fs.readFileSync('./config.json'));
const client = new Client();

client.once('ready', async () => {
    console.log(gradient.pastel('Logged in as ' + client.user.tag));
    await mainMenu();
});

client.login(config.token);
async function mainMenu() {
    const options = ['Scrape Messages', 'Download Media', 'Scrape Emojis', 'Exit'];
    const choice = readlineSync.keyInSelect(options, gradient(['pink', 'yellow'])('Choose a tool'));

    switch (choice) {
        case 0:
            await scrapeMessages();
            break;
        case 1:
            await downloadMedia();
            break;
        case 2:
            await scrapeEmojis();
            break;
        case 3:
            console.log(gradient(['blue', 'green'])('Goodbye!'));
            client.destroy();
            process.exit();
            break;
        default:
            console.log(gradient(['red', 'blue'])('Invalid option. Please try again.'));
            break;
    }
}
async function scrapeMessages() {
    const serverOrDM = readlineSync.keyInSelect(['Server', 'DM'], 'Choose message source: ');
    const messages = [];

    let guild = null;
    let userId = readlineSync.question('Enter User ID to scrape messages from: ');

    if (serverOrDM === 0) {
        const guildId = readlineSync.question('Enter Server (Guild) ID: ');
        guild = client.guilds.cache.get(guildId);
        if (!guild) {
            console.log('Invalid Server ID or not in that server!');
            return;
        }
    }

    console.log(gradient(['purple', 'yellow'])('Fetching messages...'));

    if (serverOrDM === 1) {
        const user = await client.users.fetch(userId);
        const dmChannel = await user.createDM();
        let lastId = null;

        while (true) {
            const fetched = await dmChannel.messages.fetch({ limit: 100, before: lastId });
            if (!fetched || fetched.size === 0) break;

            const userMessages = fetched.filter(msg => msg.author.id === userId);
            messages.push(...userMessages.map(msg => ({
                id: msg.id,
                channel: 'DM',
                content: msg.content,
                timestamp: msg.createdAt,
                media: msg.attachments.map(att => att.url),
                message_link: `https://discord.com/channels/@me/${msg.id}`
            })));

            lastId = fetched.last()?.id;
        }
    } else if (serverOrDM === 0 && guild) {
        console.log(gradient(['purple', 'yellow'])(`Fetching messages from user ${userId} in server: ${guild.name}...`));

        const textChannels = guild.channels.cache.filter(ch => ch.isText());
        for (const channel of textChannels.values()) {
            let lastId = null;
    
            while (true) {
                const fetched = await channel.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
                if (!fetched || fetched.size === 0) break;
    
                const userMessages = fetched.filter(msg => msg.author.id === userId);
                messages.push(...userMessages.map(msg => ({
                    id: msg.id,
                    channel: `#${channel.name}`,
                    content: msg.content,
                    timestamp: msg.createdAt,
                    media: msg.attachments.map(att => att.url),
                    message_link: `https://discord.com/channels/${guild.id}/${channel.id}/${msg.id}`

                })));
    
                lastId = fetched.last()?.id;
            }
        }
    }    
    
    const jsonPath = path.join(messagesDir, `${userId}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(messages, null, 2));
    console.log(gradient(['green', 'yellow'])('Messages saved to: ' + jsonPath));
    await mainMenu();
}

// Download Media
async function downloadMedia() {
    const files = fs.readdirSync(messagesDir).filter(file => file.endsWith('.json'));
    const jsonChoices = files.map((file, index) => `${index + 1}. ${file}`);

    const selected = readlineSync.keyInSelect(jsonChoices, 'Select JSON file to download media from: ');
    const selectedFile = files[selected];

    if (!selectedFile) {
        console.log(gradient(['red', 'blue'])('No file selected, exiting...'));
        return;
    }

    const messages = JSON.parse(fs.readFileSync(path.join(messagesDir, selectedFile), 'utf-8'));
    const uidFolder = path.join(__dirname, selectedFile.replace('.json', ''));
    if (!fs.existsSync(uidFolder)) fs.mkdirSync(uidFolder);

    let totalFiles = 0;
    for (const msg of messages) {
        for (const url of msg.media) {
            const { filename, ext } = getFileDetails(url);
            const folder = path.join(uidFolder, ext);
            if (!fs.existsSync(folder)) fs.mkdirSync(folder);

            await downloadFile(url, folder, filename);
            totalFiles++;
        }
    }

    console.log(gradient(['cyan', 'magenta'])(`Download complete! ${totalFiles} files saved.`));
    await mainMenu();
}

async function scrapeEmojis() {
    const guildId = readlineSync.question('Enter Server (Guild) ID: ');
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
        console.log('Invalid Server ID or not in that server!');
        return;
    }

    console.log(gradient(['cyan', 'yellow'])('Fetching emojis...'));

    const emojiDir = path.join(__dirname, 'emojis');
    if (!fs.existsSync(emojiDir)) fs.mkdirSync(emojiDir);

    let totalEmojis = 0;
    for (const emoji of guild.emojis.cache.values()) {
        await saveEmoji(emoji);
        totalEmojis++;
    }

    console.log(gradient(['green', 'yellow'])(`Emojis saved: ${totalEmojis}`));
    await mainMenu();
}
function getFileDetails(url) {
    try {
        const filename = new URL(url).pathname.split('/').pop().split('?')[0];
        let ext = path.extname(filename).substring(1).toLowerCase();
        if (!ext) throw new Error('Invalid extension');
        return { filename, ext };
    } catch (error) {
        console.log(gradient(['red', 'yellow'])(`[!] Unreadable URL, using random name: ${url}`));
        return { filename: uuidv4(), ext: 'unknown' };
    }
}

async function downloadFile(url, folder, filename) {
    const filePath = path.join(folder, filename);

    try {
        console.log(gradient(['blue', 'green'])(`Downloading: ${filename}`));
        const response = await axios.get(url, { responseType: 'stream' });
        const writer = fs.createWriteStream(filePath);

        response.data.pipe(writer);
        await new Promise(resolve => writer.on('finish', resolve));
    } catch (error) {
        console.error(gradient(['red', 'black'])(`Failed to download ${url}: ${error.message}`));
    }
}

async function saveEmoji(emoji) {
    const filePath = path.join(__dirname, 'emojis', emoji.name + '.png');
    const writer = fs.createWriteStream(filePath);

    try {
        const response = await axios.get(emoji.url, { responseType: 'stream' });
        response.data.pipe(writer);
        await new Promise(resolve => writer.on('finish', resolve));
        console.log(gradient(['green', 'yellow'])(`Emoji saved: ${emoji.name}`));
    } catch (error) {
        console.log(gradient(['red', 'yellow'])(`Failed to download emoji: ${emoji.name}`));
    }
}
