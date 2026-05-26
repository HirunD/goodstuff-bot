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
        // If the task is completed, wrap it in a strikethrough (~~text~~)
        if (task.is_completed) {
            listContent += `${index + 1}. ✅ ~~**${task.text}** *(assigned to ${task.user})*~~\n`;
        } else {
            listContent += `${index + 1}. ⏳ **${task.text}** *(assigned to ${task.user})*\n`;
        }

        // Interactive clear button for each item (Disable the button if it's already cleared)
        const checkButton = new ButtonBuilder()
            .setCustomId(`clear_task_${task.id}`)
            .setLabel(`✔ Clear #${index + 1}`)
            .setStyle(ButtonStyle.Success)
            .setDisabled(task.is_completed);

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
                new SlashCommandBuilder()
                    .setName('deploy')
                    .setDescription('Spawn the interactive team attendance dashboard'),
                new SlashCommandBuilder()
                    .setName('todo')
                    .setDescription('Add tasks to the queue (separate multiple items with a comma)')
                    .addStringOption(option => option.setName('tasks').setDescription('e.g., Fix routing, Update design, Client sync').setRequired(true))
            ]}
        );
    } catch (error) {
        console.error("Command Registration Error:", error);
    }
});

client.on('interactionCreate', async (interaction) => {
    // --- Handle Slash Commands ---
    if (interaction.isChatInputCommand()) {
        
        if (interaction.commandName === 'deploy') {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('clock_in').setLabel('🟢 Clock In').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('clock_out').setLabel('🔴 Clock Out').setStyle(ButtonStyle.Danger)
            );
            return interaction.reply({ content: '### 🏢 Shift Attendance Station\nUse the options below to log your status.', components: [row] });
        }

        if (interaction.commandName === 'todo') {
            const rawTasksString = interaction.options.getString('tasks');
            const assignedUser = interaction.user.username;
            const creatorId = interaction.user.id;

            // CRITICAL FIX: Before adding new tasks, wipe any previously completed 
            // tasks entirely out of the background queue array.
            localTodoQueue = localTodoQueue.filter(task => !task.is_completed);

            const parsedTasks = rawTasksString
                .split(',')
                .map(item => item.trim())
                .filter(item => item.length > 0);

            parsedTasks.forEach((taskText, i) => {
                localTodoQueue.push({
                    id: (Date.now() + i).toString(),
                    text: taskText,
                    user: assignedUser,
                    creator_id: creatorId,
                    is_completed: false    
                });
            });

            const updatedLayout = generateLiveTodoList();
            return interaction.reply(updatedLayout);
        }
    }

    // --- Handle Button Actions ---
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
                return interaction.reply({ 
                    content: `🔒 Only the list creator (**@${targetTask.user}**) has permission to tick this off.`, 
                    ephemeral: true 
                });
            }

            // Mark completed. The generateLiveTodoList() function will instantly 
            // strike it through on THIS specific message frame.
            targetTask.is_completed = true;

            const freshlyUpdatedLayout = generateLiveTodoList();
            return interaction.update(freshlyUpdatedLayout);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);