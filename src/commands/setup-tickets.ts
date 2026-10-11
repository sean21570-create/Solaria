import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("setup-tickets")
  .setDescription("Publier le message pour ouvrir un ticket")
  .addChannelOption((option) =>
    option
      .setName("salon")
      .setDescription("Le salon où publier le bouton de ticket")
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction) {
  const salon = interaction.options.getChannel("salon", true);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🎫 Support")
    .setDescription("Besoin d'aide ? Clique sur le bouton ci-dessous pour ouvrir un ticket.");

  const bouton = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("ouvrir_ticket")
      .setLabel("🎫 Ouvrir un ticket")
      .setStyle(ButtonStyle.Primary)
  );

  const salonCible = await interaction.guild?.channels.fetch(salon.id);

  if (!salonCible || !salonCible.isTextBased()) {
    await interaction.reply({
      content: "❌ Ce salon n'est pas valide.",
      ephemeral: true,
    });
    return;
  }

  await salonCible.send({ embeds: [embed], components: [bouton] });

  await interaction.reply({
    content: `✅ Le message de tickets a été publié dans <#${salon.id}>.`,
    ephemeral: true,
  });
}