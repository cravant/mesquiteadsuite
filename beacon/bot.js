require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const fs = require("fs");
const path = require("path");

const TOKEN = process.env.TOKEN;
const MASTER = process.env.MASTER_SERVER_ID;
const TEST = process.env.TEST_SERVER_ID;
const PREFIX = process.env.PREFIX || "!";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Load assignments
let serverAssignments = {};
if (fs.existsSync("assignments.json")) {
    serverAssignments = JSON.parse(fs.readFileSync("assignments.json", "utf8"));
}

// Save assignments
function saveAssignments() {
    fs.writeFileSync("assignments.json", JSON.stringify(serverAssignments, null, 2));
}

// Load available message files
function loadMessageFiles() {
    const dir = path.join(__dirname, "messages");
    return fs.readdirSync(dir).filter(f => f.endsWith(".txt"));
}

// Read message file
function readMessageFile(name) {
    return fs.readFileSync(path.join(__dirname, "messages", name), "utf8");
}

client.on("ready", () => {
    console.log(`Logged in as ${client.user.tag}`);
});

// Command system
client.on("messageCreate", async (msg) => {
    if (msg.author.bot) return;
    if (!msg.content.startsWith(PREFIX)) return;

    // Only allow commands in MASTER or TEST servers
    if (msg.guild.id !== MASTER && msg.guild.id !== TEST) return;

    const args = msg.content.slice(PREFIX.length).trim().split(" ");
    const command = args.shift().toLowerCase();

    // !listfiles
    if (command === "listfiles") {
        const files = loadMessageFiles();
        return msg.channel.send("📂 Available message files:\n" + files.join("\n"));
    }

    // !assign <guildId> <file>
    if (command === "assign") {
        const guildId = args[0];
        const file = args[1];

        if (!guildId || !file) return msg.reply("Usage: !assign <guildId> <file.txt>");

        const files = loadMessageFiles();
        if (!files.includes(file)) return msg.reply("That file does not exist.");

        serverAssignments[guildId] = file;
        saveAssignments();

        return msg.reply(`Assigned **${file}** to server **${guildId}**.`);
    }

    // !send <guildId> <channelId>
    if (command === "send") {
        const guildId = args[0];
        const channelId = args[1];

        if (!guildId || !channelId) return msg.reply("Usage: !send <guildId> <channelId>");

        const file = serverAssignments[guildId];
        if (!file) return msg.reply("No file assigned to that server.");

        const messageText = readMessageFile(file);

        try {
            const guild = await client.guilds.fetch(guildId);
            const channel = await guild.channels.fetch(channelId);

            await channel.send(messageText);
            msg.reply("Message sent successfully!");
        } catch (err) {
            msg.reply("Error: " + err.message);
        }
    }

});

client.login(TOKEN);
