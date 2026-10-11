import { EmbedBuilder, Guild } from "discord.js";
import { prisma } from "./prisma";

export async function sendLog(guild: Guild, embed: EmbedBuilder) {
  const guildConfig = await prisma.guild.findUnique({
    where: { id: guild.id },
  });

  if (!guildConfig?.logChannelId) return; // Pas de salon de logs configuré, on ne fait rien

  const salon = await guild.channels.fetch(guildConfig.logChannelId).catch(() => null);

  if (!salon || !salon.isTextBased()) return;

  await salon.send({ embeds: [embed] }).catch(() => null);
}