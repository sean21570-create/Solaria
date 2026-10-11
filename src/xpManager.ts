import { Guild, EmbedBuilder, ChannelType } from "discord.js";
import { prisma } from "./prisma";

export const SALON_NIVEAUX = "📈・niveaux";

export function xpRequisPourNiveau(niveau: number): number {
  return 6 * niveau * niveau + 60 * niveau + 150;
}

// ───────── Classement ─────────
// Ordre officiel : niveau le plus haut d'abord, puis XP dans le niveau (à niveau égal).
// À utiliser partout : /level, /stats, classements...
export const ORDRE_CLASSEMENT = [{ level: "desc" as const }, { xp: "desc" as const }];

// Position d'un membre dans le classement du serveur (1 = premier)
export async function rangDuMembre(guildId: string, niveau: number, xp: number): Promise<number> {
  const devant = await prisma.levelData.count({
    where: {
      guildId,
      OR: [{ level: { gt: niveau } }, { level: niveau, xp: { gt: xp } }],
    },
  });
  return devant + 1;
}

// XP total gagné depuis le début (niveaux terminés + progression en cours)
export function xpTotal(niveau: number, xpDansNiveau: number): number {
  let total = xpDansNiveau;
  for (let n = 0; n < niveau; n++) total += xpRequisPourNiveau(n);
  return total;
}

export async function ajouterXp(guild: Guild, userId: string, gain: number) {
  const guildId = guild.id;

  const donnees = await prisma.levelData.upsert({
    where: { guildId_userId: { guildId, userId } },
    update: { xp: { increment: gain }, lastMessageAt: new Date() },
    create: { guildId, userId, xp: gain, level: 0, lastMessageAt: new Date() },
  });

  const niveauDepart = donnees.level;
  let niveauActuel = donnees.level;
  let xpActuel = donnees.xp;

  while (xpActuel >= xpRequisPourNiveau(niveauActuel)) {
    xpActuel -= xpRequisPourNiveau(niveauActuel);
    niveauActuel++;
  }

  const niveauxGagnes = niveauActuel - niveauDepart;
  if (niveauxGagnes === 0) return;

  const xpConsommee = donnees.xp - xpActuel;

  // Mise à jour relative (et non absolue) : un gain d'XP arrivé entre-temps n'est pas écrasé.
  // La condition sur le niveau évite qu'un autre appel simultané monte deux fois de niveau.
  const maj = await prisma.levelData.updateMany({
    where: { guildId, userId, level: niveauDepart },
    data: { level: { increment: niveauxGagnes }, xp: { decrement: xpConsommee } },
  });
  if (maj.count === 0) return;

  const salon = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name === SALON_NIVEAUX
  );

  if (!salon || salon.type !== ChannelType.GuildText) {
    console.error(`⚠️ Salon "${SALON_NIVEAUX}" introuvable pour l'annonce de niveau.`);
    return;
  }

  const membre = await guild.members.fetch(userId).catch(() => null);
  const xpProchainNiveau = xpRequisPourNiveau(niveauActuel);

  const embed = new EmbedBuilder()
    .setColor(0x00d4ff)
    .setTitle("🎉 LEVEL UP !")
    .setDescription(
      `${membre ?? `<@${userId}>`} vient de passer **niveau ${niveauActuel}** !`
    )
    .addFields({
      name: "📊 Progression",
      value: `${xpActuel} / ${xpProchainNiveau} XP vers le niveau ${niveauActuel + 1}`,
    })
    .setThumbnail(membre?.user.displayAvatarURL())
    .setTimestamp();

  // Aucun ping : pas de mention hors de l'embed, et aucune mention ne notifie qui que ce soit
  await salon
    .send({ embeds: [embed], allowedMentions: { parse: [] } })
    .catch((err) => console.error("⚠️ Impossible d'envoyer l'annonce de niveau :", err));
}