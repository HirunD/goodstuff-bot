import { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes, SlashCommandBuilder } from 'discord.js';

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent
    ] 
});

// Live, offline storage array for holding tasks while the bot is running
let localTodoQueue = [];

// Helper function to build the interactive layout using live memory data
function generateLiveTodoList() {
    if (localTodoQueue.length === 0) {
        return { content: "### 📝 Team To-Do List\n🎉 All caught up! No active tasks.", components: [] };
    }

    let listContent = "### 📝 Team To-Do List\n";
    const rows = [];
    let currentRow = new ActionRowBuilder();

    localTodoQueue.forEach((task, index) => {
        listContent += `${index + 1}. ⏳ **${task.text}** *(assigned to ${task.user})*\n`;

        // Interactive clear button for each item
        const checkButton = new ButtonBuilder()
            .setCustomId(`clear_task_${task.id}`)
            .setLabel(`✔ Clear #${index + 1}`)
            .setStyle(ButtonStyle.Success);

        if (currentRow.components.length >= 5) {
            rows.push(currentRow);
            currentRow = new ActionRowBuilder();
        }
        currentRow.addComponents(checkButton);
    });

    if (currentRow.components.length > 0) rows.push(currentRow);

    return { content: listContent, components: rows };
}

client.once('ready', async () => {
    console.log(`🟩 Workspace Bot is live as ${client.user.tag}`);
    
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: [
                // 1. The Clock In/Out control command
                new SlashCommandBuilder()
                    .setName('deploy')
                    .setDescription('Spawn the interactive team attendance dashboard'),
                // 2. The local task logger command
                new SlashCommandBuilder()
                    .setName('todo')
                    .setDescription('Add a temporary task to the active channel queue')
                    .addStringOption(option => option.setName('task').setDescription('What needs to be done?').setRequired(true))
            ]}
        );
    } catch (error) {
        console.error("Command Registration Error:", error);
    }
});

client.on('interactionCreate', async (interaction) => {
    // --- HAndle Slash Commands ---
    if (interaction.isChatInputCommand()) {
        
        // 1. /deploy (Clock In / Clock Out Control Interface)
        if (interaction.commandName === 'deploy') {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('clock_in').setLabel('🟢 Clock In').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('clock_out').setLabel('🔴 Clock Out').setStyle(ButtonStyle.Danger)
            );
            return interaction.reply({ content: '### 🏢 Shift Attendance Station\nUse the options below to log your status.', components: [row] });
        }

        // 2. /todo (Add local offline tasks)
        if (interaction.commandName === 'todo') {
            const taskText = interaction.options.getString('task');
            const assignedUser = interaction.user.username;

            // Generate a temporary unique timestamp ID
            const taskObj = {
                id: Date.now().toString(),
                text: taskText,
                user: assignedUser
            };

            localTodoQueue.push(taskObj);

            const updatedLayout = generateLiveTodoList();
            return interaction.reply(updatedLayout);
        }
    }

    // --- Handle Button Actions ---
    if (interaction.isButton()) {
        
        // Handle attendance logging buttons
        if (interaction.customId === 'clock_in') {
            return interaction.reply({ content: `👋 **${interaction.user.username}** checked in at <t:${Math.floor(Date.now() / 1000)}:t>!` });
        }
        if (interaction.customId === 'clock_out') {
            return interaction.reply({ content: `🚪 **${interaction.user.username}** checked out at <t:${Math.floor(Date.now() / 1000)}:t>!` });
        }

        // Handle dynamic to-do clearing buttons
        if (interaction.customId.startsWith('clear_task_')) {
            const targetId = interaction.customId.split('_')[2];

            // Filter out the cleared item from active memory array
            localTodoQueue = localTodoQueue.filter(task => task.id !== targetId);

            const freshlyUpdatedLayout = generateLiveTodoList();
            
            // Edit the message in place instantly
            return interaction.update(freshlyUpdatedLayout);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);