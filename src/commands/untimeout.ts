import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js";
import { prisma } from "../prisma";
import { sendLog } from "../logger";

export const data = new SlashCommandBuilder()
  .setName("untimeout")
  .setDescription("Retirer le timeout d'un membre")
  .addUserOption((option) =>
    option.setName("membre").setDescription("Le membre à libérer du timeout").setRequired(true)
  )
  .addStringOption((option) =>
    option.setName("raison").setDescription("Raison").setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

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

  await guildMember.timeout(null, raison);

  await prisma.guild.upsert({
    where: { id: guildId },
    update: {},
    create: { id: guildId, name: interaction.guild?.name },
  });

  const newCase = await prisma.case.create({
    data: {
      guildId,
      userId: membre.id,
      moderatorId: interaction.user.id,
      action: "UNTIMEOUT",
      reason: raison,
    },
  });

  const embed = new EmbedBuilder()
    .setColor(0x00cc66)
    .setTitle(`✅ Timeout retiré — Case #${newCase.id}`)
    .addFields(
      { name: "Membre", value: `<@${membre.id}>`, inline: true },
      { name: "Modérateur", value: `<@${interaction.user.id}>`, inline: true },
      { name: "Raison", value: raison }
    )
    .setTimestamp();

  if (interaction.guild) await sendLog(interaction.guild, embed);

  await interaction.reply({ embeds: [embed] });
}