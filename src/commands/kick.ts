import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js";
import { prisma } from "../prisma";
import { sendLog } from "../logger";
export const data = new SlashCommandBuilder()
  .setName("kick")
  .setDescription("Expulser un membre du serveur")
  .addUserOption((option) =>
    option.setName("membre").setDescription("Le membre à expulser").setRequired(true)
  )
  .addStringOption((option) =>
    option.setName("raison").setDescription("Raison de l'expulsion").setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers);

export async function execute(interaction: ChatInputCommandInteraction) {
  const membre = interaction.options.getUser("membre", true);
  const raison = interaction.options.getString("raison", true);
  const guildId = interaction.guildId!;

  const guildMember = await interaction.guild?.members.fetch(membre.id);

  if (!guildMember) {
    await interaction.reply({
      content: "❌ Ce membre n'a pas été trouvé sur ce serveur.",
      ephemeral: true,
    });
    return;
  }

  if (!guildMember.kickable) {
    await interaction.reply({
      content: "❌ Je ne peux pas expulser ce membre (rôle trop élevé ou permissions insuffisantes).",
      ephemeral: true,
    });
    return;
  }

  // On expulse réellement le membre
  await guildMember.kick(raison);

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
      action: "KICK",
      reason: raison,
    },
  });

  const embed = new EmbedBuilder()
    .setColor(0xff4444)
    .setTitle(`👢 Expulsion — Case #${newCase.id}`)
    .addFields(
      { name: "Membre", value: `${membre.tag}`, inline: true },
      { name: "Modérateur", value: `<@${interaction.user.id}>`, inline: true },
      { name: "Raison", value: raison }
    )
    .setTimestamp();
if (interaction.guild) await sendLog(interaction.guild, embed);
  await interaction.reply({ embeds: [embed] });
}