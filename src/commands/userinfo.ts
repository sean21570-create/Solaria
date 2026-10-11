import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
} from "discord.js";
import { prisma } from "../prisma";

const NOM_ROLE_AUTORISE = "OWNER";

export const data = new SlashCommandBuilder()
  .setName("userinfo")
  .setDescription("Affiche les informations d'un membre")
  .addUserOption((option) =>
    option
      .setName("membre")
      .setDescription("Le membre à consulter (toi par défaut)")
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const membreAuteur = interaction.member as GuildMember;

  const aLeRole = membreAuteur.roles.cache.some(
    (role) => role.name === NOM_ROLE_AUTORISE
  );

  if (!aLeRole) {
    await interaction.reply({
      content: `❌ Seuls les membres avec le rôle **@${NOM_ROLE_AUTORISE}** peuvent utiliser cette commande.`,
      ephemeral: true,
    });
    return;
  }

  const utilisateurCible = interaction.options.getUser("membre") ?? interaction.user;
  const guildId = interaction.guildId!;

  const membre = await interaction.guild?.members
    .fetch(utilisateurCible.id)
    .catch(() => null);

  if (!membre) {
    await interaction.reply({
      content: "❌ Impossible de trouver ce membre sur le serveur.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  const roles = (membre as GuildMember).roles.cache
    .filter((role) => role.id !== interaction.guild!.id) // on exclut @everyone
    .sort((a, b) => b.position - a.position)
    .map((role) => `<@&${role.id}>`);

  const statutBoost = membre.premiumSince
    ? `Oui, depuis <t:${Math.floor(membre.premiumSince.getTime() / 1000)}:D>`
    : "Non";

  // Récupération en parallèle de toutes les stats de modération/activité
  const [nbWarns, nbKicks, nbBans, nbTimeoutsAuto, nbCasesTotal, stats] = await Promise.all([
    prisma.case.count({ where: { guildId, userId: utilisateurCible.id, action: "WARN" } }),
    prisma.case.count({ where: { guildId, userId: utilisateurCible.id, action: "KICK" } }),
    prisma.case.count({ where: { guildId, userId: utilisateurCible.id, action: "BAN" } }),
    prisma.case.count({
      where: { guildId, userId: utilisateurCible.id, action: "AUTOMOD_TIMEOUT" },
    }),
    prisma.case.count({ where: { guildId, userId: utilisateurCible.id } }),
    prisma.memberStats.findUnique({
      where: { guildId_userId: { guildId, userId: utilisateurCible.id } },
    }),
  ]);

  const nbMessages = stats?.messageCount ?? 0;
  const nbMentionsRecues = stats?.mentionCount ?? 0;

  const embed = new EmbedBuilder()
    .setColor(membre.displayHexColor || 0x5865f2)
    .setTitle(`Informations sur ${utilisateurCible.username}`)
    .setThumbnail(utilisateurCible.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: "👤 Pseudo", value: utilisateurCible.tag, inline: true },
      { name: "🆔 ID", value: utilisateurCible.id, inline: true },
      { name: "🤖 Bot", value: utilisateurCible.bot ? "Oui" : "Non", inline: true },
      {
        name: "📅 Compte créé le",
        value: `<t:${Math.floor(utilisateurCible.createdTimestamp / 1000)}:D>`,
        inline: true,
      },
      {
        name: "📥 A rejoint le serveur le",
        value: membre.joinedTimestamp
          ? `<t:${Math.floor(membre.joinedTimestamp / 1000)}:D>`
          : "Inconnu",
        inline: true,
      },
      { name: "💎 Booste le serveur", value: statutBoost, inline: true },
      {
        name: `🎭 Rôles (${roles.length})`,
        value: roles.length > 0 ? roles.join(" ") : "Aucun rôle",
      },
      { name: "💬 Messages envoyés", value: `${nbMessages}`, inline: true },
      { name: "📣 Mentions reçues", value: `${nbMentionsRecues}`, inline: true },
      { name: "\u200b", value: "\u200b", inline: true },
      { name: "⚠️ Avertissements", value: `${nbWarns}`, inline: true },
      { name: "👢 Kicks", value: `${nbKicks}`, inline: true },
      { name: "🔨 Bans", value: `${nbBans}`, inline: true },
      { name: "🛡️ Timeouts auto (spam)", value: `${nbTimeoutsAuto}`, inline: true },
      { name: "📋 Total sanctions (tous types)", value: `${nbCasesTotal}`, inline: true }
    )
    .setFooter({ text: `Demandé par ${interaction.user.tag}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}