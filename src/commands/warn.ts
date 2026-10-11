import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js";
import { prisma } from "../prisma";
import { sendLog } from "../logger";

export const data = new SlashCommandBuilder()
  .setName("warn")
  .setDescription("Avertir un membre")
  .addUserOption((option) =>
    option.setName("membre").setDescription("Le membre à avertir").setRequired(true)
  )
  .addStringOption((option) =>
    option.setName("raison").setDescription("Raison de l'avertissement").setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

export async function execute(interaction: ChatInputCommandInteraction) {
  const membre = interaction.options.getUser("membre", true);
  const raison = interaction.options.getString("raison", true);
  const guildId = interaction.guildId!;

  // On s'assure que le serveur existe dans notre base de données
  await prisma.guild.upsert({
    where: { id: guildId },
    update: {},
    create: { id: guildId, name: interaction.guild?.name },
  });

  // On crée le dossier (Case) de modération
  const newCase = await prisma.case.create({
    data: {
      guildId,
      userId: membre.id,
      moderatorId: interaction.user.id,
      action: "WARN",
      reason: raison,
    },
  });

  // On crée l'infraction liée
  await prisma.infraction.create({
    data: {
      guildId,
      userId: membre.id,
      type: "WARN",
      reason: raison,
    },
  });

  // On compte le nombre total d'avertissements de ce membre sur ce serveur
  const totalWarns = await prisma.infraction.count({
    where: { guildId, userId: membre.id, type: "WARN" },
  });

  const embed = new EmbedBuilder()
    .setColor(0xffcc00)
    .setTitle(`⚠️ Avertissement — Case #${newCase.id}`)
    .addFields(
      { name: "Membre", value: `<@${membre.id}>`, inline: true },
      { name: "Modérateur", value: `<@${interaction.user.id}>`, inline: true },
      { name: "Total avertissements", value: `${totalWarns}`, inline: true },
      { name: "Raison", value: raison }
    )
    .setTimestamp();
if (interaction.guild) await sendLog(interaction.guild, embed);
  await interaction.reply({ embeds: [embed] });
}