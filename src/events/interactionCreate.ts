import { ButtonInteraction, EmbedBuilder } from "discord.js";
import { prisma } from "../prisma";
import { sendLog } from "../logger";

export async function handleButtonInteraction(interaction: ButtonInteraction) {
  if (interaction.customId !== "accepter_reglement") return;

  const guildId = interaction.guildId!;
  const membre = interaction.member;

  const guildConfig = await prisma.guild.findUnique({
    where: { id: guildId },
  });

  if (!guildConfig?.unverifiedRoleId || !guildConfig?.verifiedRoleId) {
    await interaction.reply({
      content: "❌ Le système de vérification n'est pas configuré sur ce serveur.",
      ephemeral: true,
    });
    return;
  }

  const guildMember = await interaction.guild?.members.fetch(interaction.user.id);

  if (!guildMember) {
    await interaction.reply({
      content: "❌ Une erreur est survenue.",
      ephemeral: true,
    });
    return;
  }

  // On retire le rôle "Non vérifié" et on ajoute le rôle "Vérifié"
  await guildMember.roles.remove(guildConfig.unverifiedRoleId).catch(() => null);
  await guildMember.roles.add(guildConfig.verifiedRoleId).catch(() => null);

  await interaction.reply({
    content: "✅ Tu as accepté le règlement ! Tu as maintenant accès au serveur.",
    ephemeral: true,
  });

  // Log de la vérification
  if (interaction.guild) {
    const embed = new EmbedBuilder()
      .setColor(0x00cc66)
      .setTitle("✅ Membre vérifié")
      .setDescription(`<@${interaction.user.id}> a accepté le règlement.`)
      .setTimestamp();

    await sendLog(interaction.guild, embed);
  }
}