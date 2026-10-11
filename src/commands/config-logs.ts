import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
} from "discord.js";
import { prisma } from "../prisma";

export const data = new SlashCommandBuilder()
  .setName("config-logs")
  .setDescription("Définir le salon où seront envoyés les logs de modération")
  .addChannelOption((option) =>
    option
      .setName("salon")
      .setDescription("Le salon textuel pour les logs")
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction) {
  const salon = interaction.options.getChannel("salon", true);
  const guildId = interaction.guildId!;

  // On enregistre (ou met à jour) le salon de logs pour ce serveur
  await prisma.guild.upsert({
    where: { id: guildId },
    update: { logChannelId: salon.id },
    create: { id: guildId, name: interaction.guild?.name, logChannelId: salon.id },
  });

  const embed = new EmbedBuilder()
    .setColor(0x00cc66)
    .setTitle("✅ Configuration mise à jour")
    .setDescription(`Le salon de logs est maintenant <#${salon.id}>`);

  await interaction.reply({ embeds: [embed] });
}