import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js";
import { prisma } from "../prisma";

export const data = new SlashCommandBuilder()
  .setName("blacklist-add")
  .setDescription("Ajouter un mot à la liste des mots interdits")
  .addStringOption((option) =>
    option.setName("mot").setDescription("Le mot à interdire").setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction) {
  const mot = interaction.options.getString("mot", true).toLowerCase();
  const guildId = interaction.guildId!;

  await prisma.guild.upsert({
    where: { id: guildId },
    update: {},
    create: { id: guildId, name: interaction.guild?.name },
  });

  await prisma.blacklistWord.create({
    data: { guildId, word: mot },
  });

  const embed = new EmbedBuilder()
    .setColor(0x00cc66)
    .setTitle("✅ Mot ajouté à la blacklist")
    .setDescription(`Le mot \`${mot}\` est maintenant interdit sur ce serveur.`);

  await interaction.reply({ embeds: [embed], ephemeral: true });
}