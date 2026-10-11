import { Client, Guild, GuildMember } from "discord.js";
import { prisma } from "./prisma";

// Réglages anti-triche
export const BONUS_MAX = 10; // nombre maximum de chances bonus par personne
export const AGE_MIN_COMPTE_JOURS = 3; // un invité compte seulement si son compte a au moins X jours

// guildId -> (code d'invitation -> nombre d'utilisations)
const cacheInvites = new Map<string, Map<string, number>>();

async function chargerInvitations(guild: Guild) {
  try {
    const invites = await guild.invites.fetch();
    cacheInvites.set(guild.id, new Map(invites.map((i) => [i.code, i.uses ?? 0])));
  } catch (err) {
    console.error(
      `⚠️ Impossible de lire les invitations de "${guild.name}" (le bot a-t-il la permission "Gérer le serveur" ?) :`,
      (err as any)?.message ?? err
    );
  }
}

// À appeler une fois, quand le bot est prêt
export function demarrerSuiviInvitations(client: Client) {
  for (const guild of client.guilds.cache.values()) {
    chargerInvitations(guild).catch(console.error);
  }

  client.on("inviteCreate", (invite) => {
    if (!invite.guild) return;
    const cache = cacheInvites.get(invite.guild.id) ?? new Map<string, number>();
    cache.set(invite.code, invite.uses ?? 0);
    cacheInvites.set(invite.guild.id, cache);
  });

  client.on("inviteDelete", (invite) => {
    if (!invite.guild) return;
    cacheInvites.get(invite.guild.id)?.delete(invite.code);
  });

  client.on("guildCreate", (guild) => {
    chargerInvitations(guild).catch(console.error);
  });

  console.log("📨 Suivi des invitations actif");
}

// À appeler quand un membre rejoint : retrouve qui l'a invité et l'enregistre
export async function enregistrerArrivee(member: GuildMember) {
  const guild = member.guild;
  const avant = cacheInvites.get(guild.id);

  let apres;
  try {
    apres = await guild.invites.fetch();
  } catch {
    return;
  }

  cacheInvites.set(guild.id, new Map(apres.map((i) => [i.code, i.uses ?? 0])));

  if (!avant || member.user.bot) return;

  // L'invitation utilisée est celle dont le compteur d'utilisations a augmenté
  const utilisee = apres.find((i) => (i.uses ?? 0) > (avant.get(i.code) ?? 0));
  const inviterId = utilisee?.inviter?.id;
  if (!inviterId || inviterId === member.id) return;

  // Un même invité n'est compté qu'une fois (anti quitter/revenir)
  await prisma.inviteJoin
    .create({ data: { guildId: guild.id, inviterId, invitedId: member.id } })
    .catch(() => null);
}

// Nombre d'invitations valides d'une personne pendant la durée d'un giveaway
export async function compterInvitesValides(
  guild: Guild,
  inviterId: string,
  depuis: Date,
  jusqua: Date
): Promise<number> {
  const arrivees = await prisma.inviteJoin.findMany({
    where: { guildId: guild.id, inviterId, createdAt: { gte: depuis, lte: jusqua } },
    select: { invitedId: true },
    take: 100,
  });
  if (!arrivees.length) return 0;

  const membres = await guild.members.fetch({ user: arrivees.map((a) => a.invitedId) }).catch(() => null);
  if (!membres) return 0;

  const limite = Date.now() - AGE_MIN_COMPTE_JOURS * 24 * 60 * 60 * 1000;
  return membres.filter((m) => !m.user.bot && m.user.createdTimestamp <= limite).size;
}