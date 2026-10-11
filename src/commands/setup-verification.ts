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
  .setName("setup-verification")
  .setDescription("Publier le message de règlement avec le bouton de vérification")
  .addChannelOption((option) =>
    option
      .setName("salon")
      .setDescription("Le salon où publier le règlement")
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("reglement")
      .setDescription("Le texte du règlement à afficher")
      .setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction) {
  const salon = interaction.options.getChannel("salon", true);
  const reglement = interaction.options.getString("reglement", true);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📜 Règlement du serveur")
    .setDescription(reglement)
    .setFooter({ text: "Clique sur le bouton ci-dessous pour accepter et accéder au serveur" });

  const bouton = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("accepter_reglement")
      .setLabel("✅ J'accepte le règlement")
      .setStyle(ButtonStyle.Success)
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
    content: `✅ Le message de règlement a été publié dans <#${salon.id}>.`,
    ephemeral: true,
  });
}