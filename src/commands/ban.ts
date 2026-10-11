import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js";
import { prisma } from "../prisma";
import { sendLog } from "../logger";
export const data = new SlashCommandBuilder()
  .setName("ban")
  .setDescription("Bannir un membre du serveur")
  .addUserOption((option) =>
    option.setName("membre").setDescription("Le membre à bannir").setRequired(true)
  )
  .addStringOption((option) =>
    option.setName("raison").setDescription("Raison du bannissement").setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers);

export async function execute(interaction: ChatInputCommandInteraction) {
  const membre = interaction.options.getUser("membre", true);
  const raison = interaction.options.getString("raison", true);
  const guildId = interaction.guildId!;

  const guildMember = await interaction.guild?.members.fetch(membre.id).catch(() => null);

  if (guildMember && !guildMember.bannable) {
    await interaction.reply({
      content: "❌ Je ne peux pas bannir ce membre (rôle trop élevé ou permissions insuffisantes).",
      ephemeral: true,
    });
    return;
  }

  // On bannit réellement le membre (fonctionne même s'il n'est plus sur le serveur)
  await interaction.guild?.members.ban(membre.id, { reason: raison });

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
      userId: membre.id,
      moderatorId: interaction.user.id,
      action: "BAN",
      reason: raison,
    },
  });

  const embed = new EmbedBuilder()
    .setColor(0x990000)
    .setTitle(`🔨 Bannissement — Case #${newCase.id}`)
    .addFields(
      { name: "Membre", value: `${membre.tag}`, inline: true },
      { name: "Modérateur", value: `<@${interaction.user.id}>`, inline: true },
      { name: "Raison", value: raison }
    )
    .setTimestamp();
if (interaction.guild) await sendLog(interaction.guild, embed);
  await interaction.reply({ embeds: [embed] });
}