import { Client, ChannelType } from "discord.js";
import { prisma } from "./prisma";
import { ajouterXp, xpRequisPourNiveau } from "./xpManager";

const INTERVALLE_XP_VOCAL_MS = 5 * 60 * 1000; // toutes les 5 minutes
const DUREE_PAR_NIVEAU_MS = 2 * 60 * 60 * 1000; // 2h de vocal = 1 niveau
const TICKS_PAR_NIVEAU = DUREE_PAR_NIVEAU_MS / INTERVALLE_XP_VOCAL_MS; // 24
const GAIN_MAX_PAR_TICK = 1_000_000; // sécurité : la colonne xp est un Int en base

export function demarrerXpVocal(client: Client) {
  setInterval(async () => {
    for (const [, guild] of client.guilds.cache) {
      for (const [, channel] of guild.channels.cache) {
        if (channel.type !== ChannelType.GuildVoice) continue;
        if (channel.id === guild.afkChannelId) continue; // on ignore le salon AFK

        for (const [, membre] of channel.members) {
          if (membre.user.bot) continue;

          try {
            const donnees = await prisma.levelData.findUnique({
              where: { guildId_userId: { guildId: guild.id, userId: membre.id } },
            });

            const niveau = donnees?.level ?? 0;

            // 1/24 de l'XP requise pour ce niveau => exactement 1 niveau toutes les 2h de vocal
            const gain = Math.min(
              GAIN_MAX_PAR_TICK,
              Math.ceil(xpRequisPourNiveau(niveau) / TICKS_PAR_NIVEAU)
            );

            await ajouterXp(guild, membre.id, gain);
          } catch (err) {
            console.error("⚠️ Erreur XP vocal :", err);
          }
        }
      }
    }
  }, INTERVALLE_XP_VOCAL_MS);
}