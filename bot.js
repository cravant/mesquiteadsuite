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

const MSG_DIR = path.join(__dirname, "messages");
const ASSIGN_FILE = path.join(__dirname, "assignments.json");

// ensure messages dir exists
if (!fs.existsSync(MSG_DIR)) {
    console.error("ERROR: messages/ directory not found at", MSG_DIR);
}

// Load assignments
let serverAssignments = {};
if (fs.existsSync(ASSIGN_FILE)) {
    try {
        serverAssignments = JSON.parse(fs.readFileSync(ASSIGN_FILE, "utf8"));
    } catch (e) {
        console.error("Failed to read assignments.json:", e);
        serverAssignments = {};
    }
}

function saveAssignments() {
    try {
        fs.writeFileSync(ASSIGN_FILE, JSON.stringify(serverAssignments, null, 2));
    } catch (e) {
        console.error("Failed to save assignments.json:", e);
    }
}

function loadMessageFiles() {
    try {
        if (!fs.existsSync(MSG_DIR)) return [];
        return fs.readdirSync(MSG_DIR).filter(f => f.endsWith(".txt"));
    } catch (e) {
        console.error("loadMessageFiles error:", e);
        return [];
    }
}

function readMessageFile(name) {
    const full = path.join(MSG_DIR, name);
    if (!fs.existsSync(full)) throw new Error("Message file not found: " + name);
    return fs.readFileSync(full, "utf8");
}

client.on("ready", () => {
    console.log(`Logged in as ${client.user.tag}`);
});

// helper: resolve guild id from argument (accepts numeric id or <@&...> like mention)
function resolveGuildId(arg) {
    if (!arg) return null;
    // numeric id
    if (/^\d+$/.test(arg)) return arg;
    // maybe a guild mention or other wrapped form; strip non-digits and test
    const digits = arg.replace(/\D/g, "");
    if (digits.length >= 16) return digits;
    return null;
}

client.on("messageCreate", async (msg) => {
    if (msg.author.bot) return;
    if (!msg.content.startsWith(PREFIX)) return;

    // Only master + test servers can control the bot
    if (!msg.guild) return; // ignore DMs
    if (msg.guild.id !== MASTER && msg.guild.id !== TEST) {
        return msg.channel.send("⛔ Commands may only be used in the master or test server.");
    }

    const args = msg.content.slice(PREFIX.length).trim().split(/\s+/);
    const command = args.shift().toLowerCase();

    // list available message files
    if (command === "listfiles") {
        const files = loadMessageFiles();
        if (files.length === 0) return msg.channel.send("📂 No .txt files found in the messages/ folder.");
        return msg.channel.send("📂 Available message files:\n" + files.join("\n"));
    }

    // assign by explicit guild id: !assign <guildId> <file.txt>
    if (command === "assign") {
        const guildArg = args[0];
        const file = args.slice(1).join(" "); // in case filename has spaces

        if (!guildArg || !file) return msg.reply("Usage: `!assign <guildId> <file.txt>` — use `!listfiles` to see files.");

        const guildId = resolveGuildId(guildArg);
        if (!guildId) return msg.reply("Invalid guild id. Make sure you pasted the numeric server ID (enable Developer Mode → Copy ID).");

        const files = loadMessageFiles();
        if (!files.includes(file)) {
            return msg.reply(`File not found: \`${file}\`. Use \`!listfiles\` to see available files (exact names).`);
        }

        serverAssignments[guildId] = file;
        saveAssignments();
        console.log(`Assigned file ${file} to guild ${guildId} by ${msg.author.tag}`);
        return msg.reply(`✅ Assigned \`${file}\` to server ID \`${guildId}\`.`);
    }

    // assign current guild (convenience): !assign_here file.txt
    if (command === "assign_here") {
        const file = args.join(" ");
        if (!file) return msg.reply("Usage: `!assign_here <file.txt>`");

        const files = loadMessageFiles();
        if (!files.includes(file)) {
            return msg.reply(`File not found: \`${file}\`. Use \`!listfiles\` to view files.`);
        }

        const guildId = msg.guild.id;
        serverAssignments[guildId] = file;
        saveAssignments();
        console.log(`Assigned file ${file} to current guild ${guildId} by ${msg.author.tag}`);
        return msg.reply(`✅ Assigned \`${file}\` to this server (${guildId}).`);
    }

    // send once: !send <guildId> <channelId>
    if (command === "send") {
        const guildArg = args[0];
        const channelArg = args[1];

        if (!guildArg || !channelArg) return msg.reply("Usage: `!send <guildId> <channelId>`");

        const guildId = resolveGuildId(guildArg);
        const channelId = channelArg.replace(/\D/g, "");

        if (!guildId || !channelId) return msg.reply("Invalid guildId or channelId. Use Developer Mode → Copy ID.");

        const file = serverAssignments[guildId];
        if (!file) return msg.reply("No file assigned to that server. Use `!assign` or `!assign_here` first.");

        let messageText;
        try {
            messageText = readMessageFile(file);
        } catch (e) {
            return msg.reply("Failed to read message file: " + e.message);
        }

        try {
            const guild = await client.guilds.fetch(guildId);
            const channel = await guild.channels.fetch(channelId);
            await channel.send(messageText);
            return msg.reply("✅ Message sent successfully!");
        } catch (err) {
            console.error("Send error:", err);
            return msg.reply("Failed to send message: " + err.message);
        }
    }

    // rest of commands (adstart/adstop/adstatus) left unchanged...
    // If you want, I can paste the adstart/adstop block back in here (unchanged) — let me know.
});

client.login(TOKEN);
