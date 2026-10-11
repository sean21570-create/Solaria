import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js";
import { prisma } from "../prisma";
import { sendLog } from "../logger";
export const data = new SlashCommandBuilder()
  .setName("unban")
  .setDescription("Débannir un membre à partir de son ID Discord")
  .addStringOption((option) =>
    option.setName("id").setDescription("L'ID Discord du membre à débannir").setRequired(true)
  )
  .addStringOption((option) =>
    option.setName("raison").setDescription("Raison du débannissement").setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers);

export async function execute(interaction: ChatInputCommandInteraction) {
  const userId = interaction.options.getString("id", true);
  const raison = interaction.options.getString("raison", true);
  const guildId = interaction.guildId!;

  // On vérifie que ce membre est bien banni
  const bannedUser = await interaction.guild?.bans.fetch(userId).catch(() => null);

  if (!bannedUser) {
    await interaction.reply({
      content: "❌ Ce membre n'est pas banni sur ce serveur (ou l'ID est invalide).",
      ephemeral: true,
    });
    return;
  }

  // On débannit réellement
  await interaction.guild?.members.unban(userId, raison);

  // On s'assure que le serveur existe dans notre base
  await prisma.guild.upsert({
    where: { id: guildId },
    update: {},
    create: { id: guildId, name: interaction.guild?.name },
  });

  // On enregistre le Case
  const newCase = await prisma.case.create({
    data: {
      guildId,
      userId,
      moderatorId: interaction.user.id,
      action: "UNBAN",
      reason: raison,
    },
  });

  const embed = new EmbedBuilder()
    .setColor(0x00cc66)
    .setTitle(`✅ Débannissement — Case #${newCase.id}`)
    .addFields(
      { name: "Membre", value: `${bannedUser.user.tag}`, inline: true },
      { name: "Modérateur", value: `<@${interaction.user.id}>`, inline: true },
      { name: "Raison", value: raison }
    )
    .setTimestamp();
if (interaction.guild) await sendLog(interaction.guild, embed);
  await interaction.reply({ embeds: [embed] });
}