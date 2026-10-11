import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js";
import { prisma } from "../prisma";
import { sendLog } from "../logger";

export const data = new SlashCommandBuilder()
  .setName("close-ticket")
  .setDescription("Fermer le ticket actuel")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId!;
  const channelId = interaction.channelId;

  // On vérifie que ce salon est bien un ticket ouvert
  const ticket = await prisma.ticket.findFirst({
    where: { guildId, channelId, status: "OPEN" },
  });

  if (!ticket) {
    await interaction.reply({
      content: "❌ Ce salon n'est pas un ticket ouvert.",
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content: "🔒 Ce ticket va être fermé dans 5 secondes...",
  });

  // On marque le ticket comme fermé en base de données
  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { status: "CLOSED", closedAt: new Date() },
  });

  // Log de la fermeture
  if (interaction.guild) {
    const embed = new EmbedBuilder()
      .setColor(0xff4444)
      .setTitle("🔒 Ticket fermé")
      .addFields(
        { name: "Membre", value: `<@${ticket.userId}>`, inline: true },
        { name: "Fermé par", value: `<@${interaction.user.id}>`, inline: true }
      )
      .setTimestamp();

    await sendLog(interaction.guild, embed);
  }

  // On supprime le salon après un court délai
  setTimeout(async () => {
    const salon = await interaction.guild?.channels.fetch(channelId).catch(() => null);
    if (salon) await salon.delete().catch(() => null);
  }, 5000);
}