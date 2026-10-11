import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
} from "discord.js";
import { prisma } from "../prisma";

export const data = new SlashCommandBuilder()
  .setName("config-tickets")
  .setDescription("Définir la catégorie où seront créés les tickets")
  .addChannelOption((option) =>
    option
      .setName("categorie")
      .setDescription("La catégorie pour les tickets")
      .addChannelTypes(ChannelType.GuildCategory)
      .setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction) {
  const categorie = interaction.options.getChannel("categorie", true);
  const guildId = interaction.guildId!;

  await prisma.guild.upsert({
    where: { id: guildId },
    update: { ticketCategoryId: categorie.id },
    create: { id: guildId, name: interaction.guild?.name, ticketCategoryId: categorie.id },
  });

  const embed = new EmbedBuilder()
    .setColor(0x00cc66)
    .setTitle("✅ Configuration mise à jour")
    .setDescription(`La catégorie des tickets est maintenant **${categorie.name}**`);

  await interaction.reply({ embeds: [embed] });
}