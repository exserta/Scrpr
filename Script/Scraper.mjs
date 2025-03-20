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
if (!fs.existsSync(messagesDir)) fs.mkdirSync(messagesDir);

const config = JSON.parse(fs.readFileSync('./config.json'));
const client = new Client();

client.once('ready', async () => {
    console.log(gradient.pastel('Logged in as ' + client.user.tag));
    await mainMenu();
});

client.login(config.token);

async function mainMenu() {
    const options = ['Scrape Messages', 'Download Media', 'Scrape Emojis', 'Scrape Members', 'Exit'];
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
            await scrapeMembers();
            break;
        case 4:
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

async function scrapeMembers() {
    const guildId = readlineSync.question('Enter Server (Guild) ID: ');
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
        console.log(gradient(['red', 'yellow'])(`Invalid Server ID or not in that server!`));
        return;
    }

    const membersDir = path.join(__dirname, 'members');
    if (!fs.existsSync(membersDir)) fs.mkdirSync(membersDir);
    
    const membersFile = path.join(membersDir, `${guildId}.txt`);
    console.log(gradient(['cyan', 'magenta'])(`Fetching members from ${guild.name}...`));

    const members = await guild.members.fetch();
    const data = members.map(member => `${member.user.username} : ${member.user.id}`).join('\n');
    
    fs.writeFileSync(membersFile, data);
    console.log(gradient(['green', 'yellow'])(`Members saved to: ${membersFile}`));
    
    await mainMenu();
}
