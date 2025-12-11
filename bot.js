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

function saveAssignments() {
    fs.writeFileSync("assignments.json", JSON.stringify(serverAssignments, null, 2));
}

// Track running ad timers
let adIntervals = {}; // { guildId: intervalId }

// Load message files
function loadMessageFiles() {
    const dir = path.join(__dirname, "messages");
    return fs.readdirSync(dir).filter(f => f.endsWith(".txt"));
}

function readMessageFile(name) {
    return fs.readFileSync(path.join(__dirname, "messages", name), "utf8");
}

client.on("ready", () => {
    console.log(`Logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (msg) => {
    if (msg.author.bot) return;
    if (!msg.content.startsWith(PREFIX)) return;

    // Only master + test servers can control the bot
    if (msg.guild.id !== MASTER && msg.guild.id !== TEST) return;

    const args = msg.content.slice(PREFIX.length).trim().split(" ");
    const command = args.shift().toLowerCase();

    // --- BASIC CONTROLS -----------------------------

    if (command === "listfiles") {
        const files = loadMessageFiles();
        return msg.channel.send("📂 Available message files:\n" + files.join("\n"));
    }

    if (command === "assign") {
        const guildId = args[0];
        const file = args[1];

        if (!guildId || !file) return msg.reply("Usage: !assign <guildId> <file.txt>");

        const files = loadMessageFiles();
        if (!files.includes(file)) return msg.reply("❌ That file does not exist.");

        serverAssignments[guildId] = file;
        saveAssignments();
        return msg.reply(`✅ Assigned **${file}** to server **${guildId}**.`);
    }

    if (command === "send") {
        const guildId = args[0];
        const channelId = args[1];

        if (!guildId || !channelId) return msg.reply("Usage: !send <guildId> <channelId>");

        const file = serverAssignments[guildId];
        if (!file) return msg.reply("❌ No file assigned to that server.");

        const messageText = readMessageFile(file);

        try {
            const guild = await client.guilds.fetch(guildId);
            const channel = await guild.channels.fetch(channelId);
            await channel.send(messageText);
            msg.reply("✅ Message sent successfully!");
        } catch (err) {
            msg.reply("❌ Error: " + err.message);
        }
    }

    // --- AD SYSTEM -----------------------------------------------------

    if (command === "adstart") {
        const guildId = args[0];
        const channelId = args[1];

        if (!guildId || !channelId)
            return msg.reply("Usage: !adstart <guildId> <channelId>");

        const file = serverAssignments[guildId];
        if (!file) return msg.reply("❌ No ad file assigned to that server.");

        const messageText = readMessageFile(file);

        // Stop existing interval if running
        if (adIntervals[guildId]) {
            clearInterval(adIntervals[guildId]);
        }

        try {
            const guild = await client.guilds.fetch(guildId);
            const channel = await guild.channels.fetch(channelId);

            // Send once immediately
            await channel.send(messageText);

            // Start interval (every 15 minutes = 900,000 ms)
            adIntervals[guildId] = setInterval(async () => {
                try {
                    await channel.send(messageText);
                } catch (e) {
                    console.log("Send error:", e);
                }
            }, 900000);

            msg.reply(`🚀 Ads started for **${guildId}** in channel **${channelId}**.`);
        } catch (err) {
            return msg.reply("❌ Error: " + err.message);
        }
    }

    if (command === "adstop") {
        const guildId = args[0];
        if (!guildId) return msg.reply("Usage: !adstop <guildId>");

        if (!adIntervals[guildId]) {
            return msg.reply("❌ No ads running for that server.");
        }

        clearInterval(adIntervals[guildId]);
        delete adIntervals[guildId];

        msg.reply(`🛑 Ads stopped for **${guildId}**.`);
    }

    if (command === "adstatus") {
        if (Object.keys(adIntervals).length === 0) {
            return msg.reply("📭 No ads are currently running.");
        }

        let list = Object.keys(adIntervals)
            .map(id => `• ${id}`)
            .join("\n");

        msg.reply("📊 Ads currently running for:\n" + list);
    }

});

client.login(TOKEN);
