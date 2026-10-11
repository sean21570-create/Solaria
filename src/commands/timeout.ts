import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js";
import { sendLog } from "../logger";
import { prisma } from "../prisma";

export const data = new SlashCommandBuilder()
  .setName("timeout")
  .setDescription("Mettre un membre en timeout (le rendre muet temporairement)")
  .addUserOption((option) =>
    option.setName("membre").setDescription("Le membre à timeout").setRequired(true)
  )
  .addIntegerOption((option) =>
    option
      .setName("duree")
      .setDescription("Durée en minutes")
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(40320) // max autorisé par Discord = 28 jours
  )
  .addStringOption((option) =>
    option.setName("raison").setDescription("Raison du timeout").setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

export async function execute(interaction: ChatInputCommandInteraction) {
  const membre = interaction.options.getUser("membre", true);
  const dureeMinutes = interaction.options.getInteger("duree", true);
  const raison = interaction.options.getString("raison", true);
  const guildId = interaction.guildId!;

  // On récupère le membre côté serveur (pas juste l'utilisateur global)
  const guildMember = await interaction.guild?.members.fetch(membre.id);

  if (!guildMember) {
    await interaction.reply({
      content: "❌ Ce membre n'a pas été trouvé sur ce serveur.",
      ephemeral: true,
    });
    return;
  }

  // On applique réellement le timeout sur Discord
  await guildMember.timeout(dureeMinutes * 60 * 1000, raison);

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
      action: "TIMEOUT",
      reason: raison,
      duration: `${dureeMinutes} minutes`,
    },
  });

  const embed = new EmbedBuilder()
    .setColor(0xff8800)
    .setTitle(`🔇 Timeout — Case #${newCase.id}`)
    .addFields(
      { name: "Membre", value: `<@${membre.id}>`, inline: true },
      { name: "Modérateur", value: `<@${interaction.user.id}>`, inline: true },
      { name: "Durée", value: `${dureeMinutes} minutes`, inline: true },
      { name: "Raison", value: raison }
    )
    .setTimestamp();

 
  if (interaction.guild) await sendLog(interaction.guild, embed);

  await interaction.reply({ embeds: [embed] });
}