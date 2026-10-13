import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { prisma } from "../prisma";
import { formaterDuree, secondesVocal } from "../voiceStats";
import { rangDuMembre, xpRequisPourNiveau, xpTotal } from "../xpManager";

export const data = new SlashCommandBuilder()
  .setName("stats")
  .setDescription("Voir tes statistiques (niveau, vocal, rôles...) ou celles d'un membre")
  .setDMPermission(false)
  .addUserOption((o) => o.setName("membre").setDescription("Le membre à consulter (par défaut : toi)"));

export async function execute(interaction: ChatInputCommandInteraction) {
  const guild = interaction.guild;
  if (!guild) return;

  const cible = interaction.options.getUser("membre") ?? interaction.user;
  const membre = await guild.members.fetch(cible.id).catch(() => null);
  if (!membre) {
    await interaction.reply({ content: "❌ Ce membre n'est pas sur le serveur.", flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply();

  try {
    const [niveau, stats, vocalDb, vocalSecondes] = await Promise.all([
      prisma.levelData.findUnique({ where: { guildId_userId: { guildId: guild.id, userId: cible.id } } }).catch((err) => { console.error("Erreur prisma levelData:", err); return null; }),
      prisma.memberStats.findUnique({ where: { guildId_userId: { guildId: guild.id, userId: cible.id } } }).catch((err) => { console.error("Erreur prisma memberStats:", err); return null; }),
      prisma.voiceStat.findUnique({ where: { guildId_userId: { guildId: guild.id, userId: cible.id } } }).catch((err) => { console.error("Erreur prisma voiceStat:", err); return null; }),
      secondesVocal(guild.id, cible.id).catch((err) => { console.error("Erreur secondesVocal:", err); return 0; }),
    ]);

    // Classement : niveau d'abord, puis XP dans le niveau
    const rangNiveau = niveau ? await rangDuMembre(guild.id, niveau.level, niveau.xp).catch(() => null) : null;
    const rangVocal = vocalDb
      ? 1 + (await prisma.voiceStat.count({ where: { guildId: guild.id, totalSeconds: { gt: vocalDb.totalSeconds } } }).catch(() => 0))
      : null;

    // Texte du niveau avec barre de progression
    let texteNiveau = "Aucune donnée";
    if (niveau) {
      const requis = xpRequisPourNiveau(niveau.level);
      const pourcentage = Math.min(100, Math.floor((niveau.xp / requis) * 100));
      const rempli = Math.round(pourcentage / 10);
      texteNiveau =
        `Niveau **${niveau.level}**\n` +
        `${"🟦".repeat(rempli)}${"⬜".repeat(10 - rempli)}\n` +
        `${niveau.xp.toLocaleString("fr-FR")} / ${requis.toLocaleString("fr-FR")} XP\n` +
        `Total : ${xpTotal(niveau.level, niveau.xp).toLocaleString("fr-FR")} XP` +
        (rangNiveau ? `\nClassement : **#${rangNiveau}**` : "");
    }

    // Rôles, du plus haut au plus bas
    const roles = membre.roles.cache
      .filter((r) => r.id !== guild.id)
      .sort((a, b) => b.position - a.position)
      .map((r) => `<@&${r.id}>`);
    const rolesTexte = roles.length
      ? roles.slice(0, 15).join(" ") + (roles.length > 15 ? ` *+${roles.length - 15} autres*` : "")
      : "Aucun";

    const embed = new EmbedBuilder()
      .setColor(membre.displayColor || 0x5865f2)
      .setAuthor({ name: `Statistiques de ${membre.displayName}`, iconURL: cible.displayAvatarURL() })
      .setThumbnail(cible.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: "⭐ Niveau", value: texteNiveau, inline: true },
        {
          name: "🎙️ Vocal",
          value:
            vocalSecondes > 0
              ? `**${formaterDuree(vocalSecondes)}**${rangVocal ? `\nClassement : **#\${rangVocal}**` : ""}`
              : "Aucun temps enregistré",
          inline: true,
        },
        {
          name: "💬 Messages",
          value: stats ? `**${stats.messageCount.toLocaleString("fr-FR")}** envoyés` : "Aucune donnée",
          inline: true,
        },
        {
          name: "📅 Arrivée sur le serveur",
          value: membre.joinedTimestamp
            ? `<t:${Math.floor(membre.joinedTimestamp / 1000)}:D>\n(<t:${Math.floor(membre.joinedTimestamp / 1000)}:R>)`
            : "Inconnue",
          inline: true,
        },
        {
          name: "🪪 Compte créé",
          value: `<t:${Math.floor(cible.createdTimestamp / 1000)}:D>\n(<t:${Math.floor(cible.createdTimestamp / 1000)}:R>)`,
          inline: true,
        },
        {
          name: "🔊 En ce moment",
          value: membre.voice.channel ? `En vocal dans <#${membre.voice.channel.id}>` : "Pas en vocal",
          inline: true,
        },
        { name: `🏷️ Rôles (${roles.length})`, value: rolesTexte }
      )
      .setFooter({ text: `ID : ${cible.id}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  } catch (err) {
    console.error("❌ Erreur critique dans /stats :", err);
    await interaction.editReply({ content: "❌ Une erreur est survenue lors de la récupération des statistiques." }).catch(() => {});
  }
}
