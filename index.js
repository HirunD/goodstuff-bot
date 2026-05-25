import { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes, SlashCommandBuilder } from 'discord.js';
import { createClient } from '@supabase/supabase-js';

// Strip any trailing slashes or hidden API versions from the env string
const supabaseUrl = process.env.SUPABASE_URL?.trim().replace(/\/$/, '');
const supabaseKey = process.env.SUPABASE_KEY?.trim();

const supabase = createClient(supabaseUrl, supabaseKey);

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// Helper function to fetch tasks and format the interactive layout
async function generateTodoListComponent() {
    console.log(`[Database Fetch] Accessing table "todos" at: ${supabaseUrl}`);
    
    // Using an explicit collection query profile to bypass nested path routing errors
    const { data: tasks, error } = await supabase
        .from('todos')
        .select('*')
        .match({ is_completed: false })
        .order('created_at', { ascending: true });

    if (error) {
        console.error("⚠️ Detailed Supabase Fetch Error Log:", JSON.stringify(error, null, 2));
        return { content: "⚠️ **Error fetching tasks from database.** Check server console.", components: [] };
    }

    if (!tasks || tasks.length === 0) {
        return { content: "### 📝 Team To-Do List\n🎉 All caught up! No active tasks.", components: [] };
    }

    let listContent = "### 📝 Team To-Do List\n";
    const rows = [];
    let currentRow = new ActionRowBuilder();

    tasks.forEach((task, index) => {
        listContent += `${index + 1}. ⏳ **${task.task_text}** *(assigned to ${task.assigned_to})*\n`;

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
    console.log(`🚀 Bot is online as ${client.user.tag}`);
    
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

            // Insert using clean single-row object arrays
            const { error: insertError } = await supabase
                .from('todos')
                .insert({ task_text: taskText, assigned_to: assignedUser });

            if (insertError) throw insertError;

            const todoList = await generateTodoListComponent();
            await interaction.editReply(todoList);
        } catch (err) {
            console.error("⚠️ Detailed Interaction Error Log:", JSON.stringify(err, null, 2));
            await interaction.editReply({ content: "❌ Failed to create task. Check Railway server logs." });
        }
    }

    if (interaction.isButton() && interaction.customId.startsWith('complete_')) {
        const taskId = interaction.customId.split('_')[1];

        try {
            await interaction.deferUpdate();

            const { error: updateError } = await supabase
                .from('todos')
                .update({ is_completed: true })
                .match({ id: taskId });

            if (updateError) throw updateError;

            const updatedList = await generateTodoListComponent();
            await interaction.editReply(updatedList);
        } catch (err) {
            console.error("Button handling error:", err);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);