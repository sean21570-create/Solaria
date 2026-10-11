import { Guild, EmbedBuilder, ChannelType, TextChannel } from "discord.js";
import { prisma } from "./prisma";

const SALON_OBJECTIF = "🎯・objectif";

function construireEmbedObjectif(
  nbMembresActuels: number,
  objectif: number,
  description: string
): EmbedBuilder {
  const pourcentage = Math.min(100, Math.floor((nbMembresActuels / objectif) * 100));
  const nbBarres = 20;
  const barresRemplies = Math.round((pourcentage / 100) * nbBarres);
  const barre = "🟩".repeat(barresRemplies) + "⬜".repeat(nbBarres - barresRemplies);

  return new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("🎯 Objectif du serveur")
    .setDescription(description)
    .addFields(
      { name: "Membres actuels", value: `${nbMembresActuels} / ${objectif}`, inline: true },
      { name: "Progression", value: `${barre} (${pourcentage}%)` }
    )
    .setTimestamp();
}

export async function actualiserSalonObjectif(guild: Guild) {
  const salon = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name === SALON_OBJECTIF
  ) as TextChannel | undefined;

  if (!salon) {
    console.error(
      `⚠️ Salon "${SALON_OBJECTIF}" introuvable. Salons textuels disponibles :`,
      guild.channels.cache
        .filter((c) => c.type === ChannelType.GuildText)
        .map((c) => c.name)
        .join(", ")
    );
    return;
  }

  const config = await prisma.guild.upsert({
    where: { id: guild.id },
    update: {},
    create: { id: guild.id, name: guild.name },
  });

  const embed = construireEmbedObjectif(
    guild.memberCount,
    config.objectiveTarget,
    config.objectiveDescription
  );

  // On essaie d'éditer le message existant s'il y en a un
  if (config.objectiveMessageId) {
    const messageExistant = await salon.messages
      .fetch(config.objectiveMessageId)
      .catch(() => null);

    if (messageExistant) {
      await messageExistant.edit({ embeds: [embed] }).catch((err) => {
        console.error("⚠️ Impossible d'éditer le message d'objectif :", err);
      });
      return;
    }
  }

  // Pas de message existant (ou introuvable) : on en crée un nouveau et on enregistre son ID
  const nouveauMessage = await salon.send({ embeds: [embed] }).catch((err) => {
    console.error("⚠️ Impossible d'envoyer le message d'objectif :", err);
    return null;
  });

  if (nouveauMessage) {
    await prisma.guild.update({
      where: { id: guild.id },
      data: { objectiveMessageId: nouveauMessage.id },
    });
  }
}