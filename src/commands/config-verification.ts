import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js";
import { prisma } from "../prisma";

export const data = new SlashCommandBuilder()
  .setName("config-verification")
  .setDescription("Configurer les rôles de vérification")
  .addRoleOption((option) =>
    option.setName("non-verifie").setDescription("Le rôle donné aux nouveaux membres").setRequired(true)
  )
  .addRoleOption((option) =>
    option.setName("verifie").setDescription("Le rôle donné après vérification").setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction) {
  const roleNonVerifie = interaction.options.getRole("non-verifie", true);
  const roleVerifie = interaction.options.getRole("verifie", true);
  const guildId = interaction.guildId!;

  await prisma.guild.upsert({
    where: { id: guildId },
    update: { unverifiedRoleId: roleNonVerifie.id, verifiedRoleId: roleVerifie.id },
    create: {
      id: guildId,
      name: interaction.guild?.name,
      unverifiedRoleId: roleNonVerifie.id,
      verifiedRoleId: roleVerifie.id,
    },
  });

  const embed = new EmbedBuilder()
    .setColor(0x00cc66)
    .setTitle("✅ Configuration de vérification mise à jour")
    .addFields(
      { name: "Rôle non vérifié", value: `<@&${roleNonVerifie.id}>` },
      { name: "Rôle vérifié", value: `<@&${roleVerifie.id}>` }
    );

  await interaction.reply({ embeds: [embed] });
}