import { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes, SlashCommandBuilder } from 'discord.js';
import Datastore from 'nedb-async';

// Initialize a local file-based database
const db = new Datastore({ filename: 'todos.db', autoplay: true });

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// Helper function to fetch tasks and format the interactive layout
async function generateTodoListComponent() {
    try {
        // Fetch only active (pending) tasks from the local file
        const tasks = await db.asyncFind({ is_completed: false });
        
        // Sort by creation time (oldest first)
        tasks.sort((a, b) => a.created_at - b.created_at);

        if (!tasks || tasks.length === 0) {
            return { content: "### 📝 Team To-Do List\n🎉 All caught up! No active tasks.", components: [] };
        }

        let listContent = "### 📝 Team To-Do List\n";
        const rows = [];
        let currentRow = new ActionRowBuilder();

        tasks.forEach((task, index) => {
            listContent += `${index + 1}. ⏳ **${task.task_text}** *(assigned to ${task.assigned_to})*\n`;

            // Create a check-off button for each item (Max 5 buttons per row in Discord)
            const checkButton = new ButtonBuilder()
                .setCustomId(`complete_${task._id}`) // NeDB automatically creates a unique '_id'
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
    } catch (error) {
        console.error("Local DB Fetch Error:", error);
        return { content: "⚠️ **Error fetching tasks from internal storage.**", components: [] };
    }
}

client.once('ready', async () => {
    console.log(`🚀 Bot is online locally as ${client.user.tag}`);
    
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: [
                new SlashCommandBuilder()
                    .setName('todo')
                    .setDescription('Add a new task to the team tracking queue')
                    .addStringOption(option => option.setName('task').setDescription('What needs to be done?').setRequired(true))
            ]}
        );
    } catch (error) {
        console.error("Slash Command Registration Error:", error);
    }
});

client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand() && interaction.commandName === 'todo') {
        const taskText = interaction.options.getString('task');
        const assignedUser = interaction.user.username;

        try {
            await interaction.deferReply();

            // Insert new task object directly into the local file
            await db.asyncInsert({
                task_text: taskText,
                assigned_to: assignedUser,
                is_completed: false,
                created_at: Date.now()
            });

            const todoList = await generateTodoListComponent();
            await interaction.editReply(todoList);
        } catch (err) {
            console.error("Task creation failure:", err);
            await interaction.editReply({ content: "❌ Failed to create task locally." });
        }
    }

    if (interaction.isButton() && interaction.customId.startsWith('complete_')) {
        const taskId = interaction.customId.split('_')[1];

        try {
            await interaction.deferUpdate();

            // Update the local object row using its ID
            await db.asyncUpdate({ _id: taskId }, { $set: { is_completed: true } });

            const updatedList = await generateTodoListComponent();
            await interaction.editReply(updatedList);
        } catch (err) {
            console.error("Button handling error:", err);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);