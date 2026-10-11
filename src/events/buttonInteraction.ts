import { ButtonInteraction, EmbedBuilder, ChannelType, PermissionFlagsBits } from "discord.js";
import { prisma } from "../prisma";
import { sendLog } from "../logger";

export async function handleButtonInteraction(interaction: ButtonInteraction) {
  if (interaction.customId === "accepter_reglement") {
    await gererAcceptationReglement(interaction);
    return;
  }

  if (interaction.customId === "ouvrir_ticket") {
    await gererOuvertureTicket(interaction);
    return;
  }
}

async function gererAcceptationReglement(interaction: ButtonInteraction) {
  const guildId = interaction.guildId!;

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

  await guildMember.roles.remove(guildConfig.unverifiedRoleId).catch(() => null);
  await guildMember.roles.add(guildConfig.verifiedRoleId).catch(() => null);

  await interaction.reply({
    content: "✅ Tu as accepté le règlement ! Tu as maintenant accès au serveur.",
    ephemeral: true,
  });

  if (interaction.guild) {
    const embed = new EmbedBuilder()
      .setColor(0x00cc66)
      .setTitle("✅ Membre vérifié")
      .setDescription(`<@${interaction.user.id}> a accepté le règlement.`)
      .setTimestamp();

    await sendLog(interaction.guild, embed);
  }
}

async function gererOuvertureTicket(interaction: ButtonInteraction) {
  const guildId = interaction.guildId!;

  const guildConfig = await prisma.guild.findUnique({
    where: { id: guildId },
  });

  if (!guildConfig?.ticketCategoryId) {
    await interaction.reply({
      content: "❌ Le système de tickets n'est pas configuré sur ce serveur.",
      ephemeral: true,
    });
    return;
  }

  // On vérifie si ce membre a déjà un ticket ouvert
  const ticketExistant = await prisma.ticket.findFirst({
    where: { guildId, userId: interaction.user.id, status: "OPEN" },
  });

  if (ticketExistant) {
    // On vérifie que le salon existe encore réellement
    const salonEncoreLa = await interaction.guild?.channels
      .fetch(ticketExistant.channelId)
      .catch(() => null);

    if (salonEncoreLa) {
      await interaction.reply({
        content: `❌ Tu as déjà un ticket ouvert : <#${ticketExistant.channelId}>`,
        ephemeral: true,
      });
      return;
    } else {
      // Le salon a été supprimé manuellement, on nettoie la base de données
      await prisma.ticket.update({
        where: { id: ticketExistant.id },
        data: { status: "CLOSED", closedAt: new Date() },
      });
    }
  }

  await interaction.deferReply({ ephemeral: true });

  // On crée le salon de ticket, visible uniquement par le membre et les modérateurs
  const salonTicket = await interaction.guild!.channels.create({
    name: `ticket-${interaction.user.username}`,
    type: ChannelType.GuildText,
    parent: guildConfig.ticketCategoryId,
    permissionOverwrites: [
      {
        id: interaction.guild!.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: interaction.user.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
      },
    ],
  });

  await prisma.ticket.create({
    data: {
      guildId,
      userId: interaction.user.id,
      channelId: salonTicket.id,
      category: "SUPPORT",
    },
  });

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🎫 Nouveau ticket")
    .setDescription(
      `Bienvenue <@${interaction.user.id}> !\nUn membre de l'équipe va te répondre bientôt. Décris ton problème ci-dessous.`
    );

  await salonTicket.send({ embeds: [embed] });

  await interaction.editReply({
    content: `✅ Ton ticket a été créé : <#${salonTicket.id}>`,
  });
}