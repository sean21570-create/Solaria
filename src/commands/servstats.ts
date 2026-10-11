import { ChannelType, ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { prisma } from "../prisma";
import { formaterDuree } from "../voiceStats";
import { xpTotal } from "../xpManager";

export const data = new SlashCommandBuilder()
  .setName("servstats")
  .setDescription("Voir les statistiques globales du serveur")
  .setDMPermission(false);

const JOUR_MS = 24 * 60 * 60 * 1000;
const NB_SEMAINES = 8;

const nombre = (n: number) => n.toLocaleString("fr-FR");

export async function execute(interaction: ChatInputCommandInteraction) {
  const guild = interaction.guild;
  if (!guild) return;

  await interaction.deferReply();

  // Liste complète des membres pour des chiffres exacts (humains / bots / dates d'arrivée)
  const membres = await guild.members.fetch().catch(() => guild.members.cache);
  const maintenant = Date.now();

  const total = membres.size;
  const bots = membres.filter((m) => m.user.bot).size;
  const humains = total - bots;

  // Arrivées (des membres encore présents) sur différentes périodes
  const arrivees = membres.filter((m) => !m.user.bot && m.joinedTimestamp).map((m) => m.joinedTimestamp as number);
  const depuis = (jours: number) => arrivees.filter((t) => maintenant - t < jours * JOUR_MS).length;

  // Graphique : nouveaux membres par semaine
  const semaines: { label: string; valeur: number }[] = [];
  for (let i = NB_SEMAINES - 1; i >= 0; i--) {
    const debut = maintenant - (i + 1) * 7 * JOUR_MS;
    const fin = maintenant - i * 7 * JOUR_MS;
    semaines.push({
      label: i === 0 ? "Cette sem." : `-${i} sem.`,
      valeur: arrivees.filter((t) => t >= debut && t < fin).length,
    });
  }
  const max = Math.max(1, ...semaines.map((s) => s.valeur));
  const graphique = semaines
    .map((s) => {
      const barre = "█".repeat(Math.round((s.valeur / max) * 12));
      return `${s.label.padEnd(10)} ${barre.padEnd(12)} ${s.valeur}`;
    })
    .join("\n");

  // Données enregistrées par le bot
  const [vocal, messages, lignesNiveaux, config] = await Promise.all([
    prisma.voiceStat.aggregate({ where: { guildId: guild.id }, _sum: { totalSeconds: true }, _count: true }),
    prisma.memberStats.aggregate({ where: { guildId: guild.id }, _sum: { messageCount: true } }),
    prisma.levelData.findMany({ where: { guildId: guild.id }, select: { level: true, xp: true } }),
    prisma.guild.findUnique({ where: { id: guild.id } }),
  ]);

  // Niveaux : l'XP de ta base repart de zéro à chaque niveau, donc on recalcule l'XP total réel
  const niveauMax = lignesNiveaux.reduce((m, l) => Math.max(m, l.level), 0);
  const xpCumule = lignesNiveaux.reduce((somme, l) => somme + xpTotal(l.level, l.xp), 0);

  const secondesVocal = vocal._sum.totalSeconds ?? 0;
  const enVocal = guild.voiceStates.cache.filter((v) => !!v.channelId && !v.member?.user.bot).size;
  const moyenneVocal = vocal._count > 0 ? Math.round(secondesVocal / vocal._count) : 0;

  // Objectif de membres
  let objectif = "Aucun objectif défini";
  if (config?.objectiveTarget) {
    const pourcentage = Math.min(100, Math.round((total / config.objectiveTarget) * 100));
    const rempli = Math.round(pourcentage / 10);
    objectif = `${"🟩".repeat(rempli)}${"⬜".repeat(10 - rempli)}\n**${nombre(total)} / ${nombre(config.objectiveTarget)}** (${pourcentage} %)`;
  }

  // Infos générales
  const salons = guild.channels.cache;
  const nbTextes = salons.filter((c) => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement).size;
  const nbVocaux = salons.filter((c) => c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice).size;
  const ageJours = Math.floor((maintenant - guild.createdTimestamp) / JOUR_MS);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({ name: `Statistiques de ${guild.name}`, iconURL: guild.iconURL() ?? undefined })
    .setThumbnail(guild.iconURL({ size: 256 }))
    .addFields(
      {
        name: "👥 Membres",
        value: `**${nombre(total)}** au total\n${nombre(humains)} humains · ${nombre(bots)} bots`,
        inline: true,
      },
      {
        name: "📈 Nouveaux membres",
        value: `24 h : **+${nombre(depuis(1))}**\n7 jours : **+${nombre(depuis(7))}**\n30 jours : **+${nombre(depuis(30))}**`,
        inline: true,
      },
      {
        name: "🎙️ Vocal",
        value:
          secondesVocal > 0
            ? `**${formaterDuree(secondesVocal)}** cumulées\nMoyenne : ${formaterDuree(moyenneVocal)} par membre\nEn vocal maintenant : **${enVocal}**`
            : `Aucun temps enregistré pour l'instant\nEn vocal maintenant : **${enVocal}**`,
        inline: true,
      },
      {
        name: "💬 Messages",
        value: `**${nombre(messages._sum.messageCount ?? 0)}** envoyés`,
        inline: true,
      },
      {
        name: "⭐ Niveaux",
        value: `Niveau max : **${nombre(niveauMax)}**\n${nombre(xpCumule)} XP cumulés\n${nombre(lignesNiveaux.length)} membres classés`,
        inline: true,
      },
      {
        name: "🏰 Serveur",
        value:
          `Créé il y a **${nombre(ageJours)}** jours\n` +
          `${nombre(nbTextes)} salons textuels · ${nombre(nbVocaux)} vocaux\n` +
          `${nombre(Math.max(0, guild.roles.cache.size - 1))} rôles · ${nombre(guild.emojis.cache.size)} emojis\n` +
          `Boost : niveau ${guild.premiumTier} (${guild.premiumSubscriptionCount ?? 0} boosts)`,
        inline: true,
      },
      { name: "🎯 Objectif de membres", value: objectif },
      { name: `📊 Arrivées par semaine (${NB_SEMAINES} dernières)`, value: "```\n" + graphique + "\n```" }
    )
    .setFooter({ text: "Arrivées : membres encore présents · vocal : depuis l'activation du suivi" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}