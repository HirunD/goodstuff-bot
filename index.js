import { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes, SlashCommandBuilder } from 'discord.js';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase Client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// Helper function to fetch tasks and format the interactive layout
async function generateTodoListComponent() {
    // Fetch only active (pending) tasks from the database
    const { data: tasks, error } = await supabase
        .from('todos')
        .where('is_completed', false)
        .order('created_at', { ascending: true });

    if (error || !tasks || tasks.length === 0) {
        return { content: "### 📝 Team To-Do List\n🎉 All caught up! No active tasks.", components: [] };
    }

    let listContent = "### 📝 Team To-Do List\n";
    const rows = [];
    let currentRow = new ActionRowBuilder();

    tasks.forEach((task, index) => {
        // Build the visible list text block
        listContent += `${index + 1}. ⏳ **${task.task_text}** *(assigned to ${task.assigned_to})*\n`;

        // Create a check-off button for each item (Max 5 buttons per row in Discord)
        const checkButton = new ButtonBuilder()
            .setCustomId(`complete_${task.id}`)
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
    console.log(`Bot is online as ${client.user.tag}`);
    
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
        console.error(error);
    }
});

client.on('interactionCreate', async (interaction) => {
    // 1. Handle Slash Command (/todo)
    if (interaction.isChatInputCommand() && interaction.commandName === 'todo') {
        const taskText = interaction.options.getString('task');
        const assignedUser = interaction.user.username;

        // Save the new task into the database row
        await supabase
            .from('todos')
            .insert([{ task_text: taskText, assigned_to: assignedUser }]);

        // Generate the fresh list showing previous items along with the new one
        const todoList = await generateTodoListComponent();
        
        await interaction.reply({ content: `✅ Task added: "*${taskText}*"`, ephemeral: true });
        
        // Post the dynamic main list directly into the channel channel
        return interaction.channel.send(todoList);
    }

    // 2. Handle Completing Tasks (Button Clicks)
    if (interaction.isButton() && interaction.customId.startsWith('complete_')) {
        const taskId = interaction.customId.split('_')[1];

        // Mark that exact ID index row as true (completed)
        await supabase
            .from('todos')
            .update({ is_completed: true })
            .eq('id', taskId);

        // Fetch the updated queue layout state
        const updatedList = await generateTodoListComponent();

        // Update the existing message instantly so it reflects the checked off item
        return interaction.update(updatedList);
    }
});

client.login(process.env.DISCORD_TOKEN);