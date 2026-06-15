import { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes, SlashCommandBuilder } from 'discord.js';
import cron from 'node-cron';
import fs from 'fs';

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent
    ] 
});

const FILE_PATH = './todos.json';
let localTodoQueue = [];

// Helper to load tasks safely from our local file on startup
function loadTasksFromFile() {
    try {
        if (fs.existsSync(FILE_PATH)) {
            const data = fs.readFileSync(FILE_PATH, 'utf8');
            localTodoQueue = JSON.parse(data);
            console.log(`💾 Loaded ${localTodoQueue.length} tasks from backup file.`);
        }
    } catch (err) {
        console.error("⚠️ Failed to read backup file, starting fresh:", err);
        localTodoQueue = [];
    }
}

// Helper to save tasks instantly whenever a change happens
function saveTasksToFile() {
    try {
        fs.writeFileSync(FILE_PATH, JSON.stringify(localTodoQueue, null, 2), 'utf8');
    } catch (err) {
        console.error("⚠️ Failed to write tasks to backup file:", err);
    }
}

function generateLiveTodoList() {
    if (localTodoQueue.length === 0) {
        return { content: "### 📝 Team To-Do List\n🎉 All caught up! No active tasks right now.", components: [] };
    }

    const groupedTasks = {};
    localTodoQueue.forEach((task) => {
        if (!groupedTasks[task.user]) {
            groupedTasks[task.user] = [];
        }
        groupedTasks[task.user].push(task);
    });

    let listContent = "### 📝 Team To-Do List (Today's Progress)\n";
    const rows = [];
    let currentRow = new ActionRowBuilder();
    let globalButtonIndex = 1;

    for (const [username, tasks] of Object.entries(groupedTasks)) {
        listContent += `\n👤 **@${username}**\n`;
        
        tasks.forEach((task) => {
            if (task.is_completed) {
                listContent += `  ${globalButtonIndex}. ✅ ~~${task.text}~~\n`;
            } else {
                listContent += `  ${globalButtonIndex}. ⏳ ${task.text}\n`;
            }

            const checkButton = new ButtonBuilder()
                .setCustomId(`clear_task_${task.id}`)
                .setLabel(`✔ Clear #${globalButtonIndex}`)
                .setStyle(ButtonStyle.Success)
                .setDisabled(task.is_completed);

            if (currentRow.components.length >= 5) {
                rows.push(currentRow);
                currentRow = new ActionRowBuilder();
            }
            currentRow.addComponents(checkButton);
            
            globalButtonIndex++;
        });
    }

    if (currentRow.components.length > 0) rows.push(currentRow);

    return { content: listContent, components: rows };
}

client.once('ready', async () => {
    console.log(`🟩 Workspace Bot is live as ${client.user.tag}`);
    
    // Load existing data immediately when the bot boots up
    loadTasksFromFile();
    
    // --- AUTOMATED DAILY DASHBOARD DEPLOYMENT (8:30 AM) ---
    cron.schedule('30 8 * * *', async () => {
        console.log("⏰ 8:30 AM hit. Automatically deploying Shift Attendance Station...");
        const channelId = process.env.ANNOUNCEMENT_CHANNEL_ID;
        if (!channelId) return;

        try {
            const targetChannel = await client.channels.fetch(channelId);
            if (targetChannel) {
                const attendanceRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('clock_in').setLabel('🟢 Clock In').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('clock_out').setLabel('🔴 Clock Out').setStyle(ButtonStyle.Danger)
                );
                await targetChannel.send({ 
                    content: '### 🏢 Shift Attendance Station\nUse the options below to log your status.', 
                    components: [attendanceRow] 
                });
            }
        } catch (err) {
            console.error("Automation error:", err);
        }
    }, {
        scheduled: true,
        timezone: "Asia/Colombo"
    });

    // --- SMART MIDNIGHT CLEANUP (00:00 AM) ---
    cron.schedule('0 0 * * *', () => {
        console.log("🧹 Midnight hit. Cleaning out completed items...");
        localTodoQueue = localTodoQueue.filter(task => !task.is_completed);
        saveTasksToFile(); // Save the clean rolled-over list
    }, {
        scheduled: true,
        timezone: "Asia/Colombo"
    });

    // Register slash commands
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: [
                new SlashCommandBuilder().setName('deploy').setDescription('Spawn the interactive team attendance dashboard'),
                new SlashCommandBuilder()
                    .setName('todo')
                    .setDescription('Add your tasks to the master team queue')
                    .addStringOption(option => option.setName('tasks').setDescription('List your tasks separated by commas').setRequired(true))
            ]}
        );
    } catch (error) {
        console.error("Command Registration Error:", error);
    }
});

client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'deploy') {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('clock_in').setLabel('🟢 Clock In').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('clock_out').setLabel('🔴 Clock Out').setStyle(ButtonStyle.Danger)
            );
            return interaction.reply({ content: '### 🏢 Shift Attendance Station\nUse the options below to log your status.', components: [row] });
        }

        if (interaction.commandName === 'todo') {
            // Fix 1: Defer reply immediately so slow bootups don't trigger the Discord error layout
            await interaction.deferReply();

            const rawTasksString = interaction.options.getString('tasks');
            const triggeringUser = interaction.user.username; 
            const creatorId = interaction.user.id;

            const parsedTasks = rawTasksString.split(',').map(item => item.trim()).filter(item => item.length > 0);

            parsedTasks.forEach((taskText, i) => {
                localTodoQueue.push({
                    id: (Date.now() + i).toString(),
                    text: taskText,
                    user: triggeringUser, 
                    creator_id: creatorId,
                    is_completed: false    
                });
            });

            // Save changes locally right away
            saveTasksToFile();

            const masterLayout = generateLiveTodoList();
            return interaction.editReply(masterLayout);
        }
    }

    if (interaction.isButton()) {
        if (interaction.customId === 'clock_in') {
            return interaction.reply({ content: `👋 **${interaction.user.username}** checked in at <t:${Math.floor(Date.now() / 1000)}:t>!` });
        }
        if (interaction.customId === 'clock_out') {
            return interaction.reply({ content: `🚪 **${interaction.user.username}** checked out at <t:${Math.floor(Date.now() / 1000)}:t>!` });
        }

        if (interaction.customId.startsWith('clear_task_')) {
            const targetId = interaction.customId.split('_')[2];
            const targetTask = localTodoQueue.find(task => task.id === targetId);

            if (!targetTask) {
                return interaction.reply({ content: "⚠️ Task not found in active memory queue.", ephemeral: true });
            }

            if (interaction.user.id !== targetTask.creator_id) {
                return interaction.reply({ content: `🔒 Only **@${targetTask.user}** has permission to clear this specific task.`, ephemeral: true });
            }

            targetTask.is_completed = true;
            
            // Save state updates safely
            saveTasksToFile();

            const freshlyUpdatedLayout = generateLiveTodoList();
            return interaction.update(freshlyUpdatedLayout);
        }
    }
});

client.client.login(process.env.DISCORD_TOKEN);