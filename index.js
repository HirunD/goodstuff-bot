import { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes, SlashCommandBuilder } from 'discord.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.once('ready', async () => {
    console.log(`Bot is online as ${client.user.tag}`);
    
    // Register the /todo command
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: [
                new SlashCommandBuilder()
                    .setName('todo')
                    .setDescription('Post a new task to this channel')
                    .addStringOption(option => option.setName('task').setDescription('What needs to be done?').setRequired(true))
            ]}
        );
    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', async (interaction) => {
    // 1. Handle Clock In / Clock Out Buttons
    if (interaction.isButton()) {
        const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        if (interaction.customId === 'clock_in') {
            await interaction.reply({ content: `🟩 **${interaction.user.username}** clocked in at **${timeString}**` });
        } else if (interaction.customId === 'clock_out') {
            await interaction.reply({ content: `🟥 **${interaction.user.username}** clocked out at **${timeString}**` });
        }
    }

    // 2. Handle /todo Slash Command
    if (interaction.isChatInputCommand() && interaction.commandName === 'todo') {
        const taskText = interaction.options.getString('task');
        // Sends a message with a native Discord markdown checkbox
        await interaction.reply({ content: `- [ ] ${taskText} *(assigned to ${interaction.user})*` });
    }
});

// Setup Command to deploy the permanent interactive buttons
client.on('messageCreate', async (message) => {
    if (message.content === '!deploy' && message.member.permissions.has('Administrator')) {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('clock_in').setLabel('Clock In').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('clock_out').setLabel('Clock Out').setStyle(ButtonStyle.Danger)
        );
        await message.channel.send({ content: '## ⏰ Company Clock\nTap a button below to log your shift directly to this channel.', components: [row] });
        await message.delete(); // Cleans up the !deploy text command automatically
    }
});

client.login(process.env.DISCORD_TOKEN);