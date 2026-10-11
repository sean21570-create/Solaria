import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
} from "discord.js";
import { prisma } from "../prisma";

export const data = new SlashCommandBuilder()
  .setName("config-welcome")
  .setDescription("Configurer le système de bienvenue")
  .addChannelOption((option) =>
    option
      .setName("salon")
      .setDescription("Le salon où envoyer les messages de bienvenue")
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("message")
      .setDescription("Le message de bienvenue. Utilise {membre} pour mentionner la personne")
      .setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction) {
  const salon = interaction.options.getChannel("salon", true);
  const message = interaction.options.getString("message", true);
  const guildId = interaction.guildId!;

  await prisma.guild.upsert({
    where: { id: guildId },
    update: { welcomeChannelId: salon.id, welcomeMessage: message },
    create: {
      id: guildId,
      name: interaction.guild?.name,
      welcomeChannelId: salon.id,
      welcomeMessage: message,
    },
  });

  const embed = new EmbedBuilder()
    .setColor(0x00cc66)
    .setTitle("✅ Configuration de bienvenue mise à jour")
    .addFields(
      { name: "Salon", value: `<#${salon.id}>` },
      { name: "Message", value: message }
    );

  await interaction.reply({ embeds: [embed] });
}