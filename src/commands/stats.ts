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
  console.log(`[STATS] Début de l'exécution pour ${cible.tag} sur ${guild.name}`);

  try {
    console.log("[STATS] Appel de Prisma (levelData, memberStats, voiceStat)...");
    
    // On isole les appels avec un timeout de sécurité de 5 secondes pour éviter le blocage infini
    const timeoutPromise = (promise: Promise<any>, nom: string) => 
      Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout sur ${nom}`)), 5000))
      ]);

    const [niveau, stats, vocalDb, vocalSecondes] = await Promise.all([
      timeoutPromise(prisma.levelData.findUnique({ where: { guildId_userId: { guildId: guild.id, userId: cible.id } } }), "levelData").catch(e => { console.error(e); return null; }),
      timeoutPromise(prisma.memberStats.findUnique({ where: { guildId_userId: { guildId: guild.id, userId: cible.id } } }), "memberStats").catch(e => { console.error(e); return null; }),
      timeoutPromise(prisma.voiceStat.findUnique({ where: { guildId_userId: { guildId: guild.id, userId: cible.id } } }), "voiceStat").catch(e => { console.error(e); return null; }),
      timeoutPromise(secondesVocal(guild.id, cible.id), "secondesVocal").catch(e => { console.error(e); return 0; }),
    ]);

    console.log("[STATS] Données récupérées avec succès !");

    // Classement
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
