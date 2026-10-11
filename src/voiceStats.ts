import { Client, VoiceState } from "discord.js";
import { prisma } from "./prisma";

const INTERVALLE_MS = 60 * 1000; // enregistrement toutes les minutes

// "guildId:userId" -> dernier instant déjà comptabilisé
const actifs = new Map<string, number>();

const cle = (guildId: string, userId: string) => `${guildId}:${userId}`;

// Un membre est comptabilisé s'il est en vocal, n'est pas un bot et n'est pas dans le salon AFK
function compte(state: VoiceState): boolean {
  return !!state.channelId && !state.member?.user.bot && state.channelId !== state.guild.afkChannelId;
}

async function ajouter(guildId: string, userId: string, secondes: number) {
  if (secondes <= 0) return;
  await prisma.voiceStat.upsert({
    where: { guildId_userId: { guildId, userId } },
    update: { totalSeconds: { increment: secondes } },
    create: { guildId, userId, totalSeconds: secondes },
  });
}

// Enregistre le temps écoulé depuis le dernier enregistrement
async function enregistrer(key: string) {
  const debut = actifs.get(key);
  if (debut === undefined) return;

  const secondes = Math.floor((Date.now() - debut) / 1000);
  if (secondes <= 0) return;

  // On avance le curseur seulement des secondes comptées, pour ne perdre aucune fraction de seconde
  actifs.set(key, debut + secondes * 1000);

  const [guildId, userId] = key.split(":");
  await ajouter(guildId, userId, secondes).catch((err) =>
    console.error("⚠️ Impossible d'enregistrer le temps vocal :", err)
  );
}

// Temps vocal total d'un membre, session en cours comprise (en secondes)
export async function secondesVocal(guildId: string, userId: string): Promise<number> {
  const ligne = await prisma.voiceStat.findUnique({ where: { guildId_userId: { guildId, userId } } });
  const enCours = actifs.get(cle(guildId, userId));
  const supplement = enCours !== undefined ? Math.max(0, Math.floor((Date.now() - enCours) / 1000)) : 0;
  return (ligne?.totalSeconds ?? 0) + supplement;
}

export function formaterDuree(secondes: number): string {
  if (secondes < 60) return `${secondes} s`;
  const heures = Math.floor(secondes / 3600);
  const minutes = Math.floor((secondes % 3600) / 60);
  return heures > 0 ? `${heures} h ${minutes.toString().padStart(2, "0")} min` : `${minutes} min`;
}

export function demarrerSuiviVocal(client: Client) {
  // Membres déjà en vocal au démarrage du bot
  for (const guild of client.guilds.cache.values()) {
    for (const state of guild.voiceStates.cache.values()) {
      if (compte(state)) actifs.set(cle(guild.id, state.id), Date.now());
    }
  }

  client.on("voiceStateUpdate", async (ancien, nouveau) => {
    const key = cle(nouveau.guild.id, nouveau.id);
    const avant = compte(ancien);
    const maintenant = compte(nouveau);

    if (avant && !maintenant) {
      await enregistrer(key);
      actifs.delete(key);
    } else if (!avant && maintenant) {
      actifs.set(key, Date.now());
    }
  });

  let enCours = false;
  setInterval(async () => {
    if (enCours) return;
    enCours = true;
    try {
      for (const key of [...actifs.keys()]) await enregistrer(key);
    } finally {
      enCours = false;
    }
  }, INTERVALLE_MS);

  console.log("🎙️ Suivi du temps vocal actif");
}