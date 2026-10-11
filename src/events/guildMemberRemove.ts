import { GuildMember, PartialGuildMember, ChannelType } from "discord.js";
import { actualiserSalonCompteur } from "../memberCountChannel";
import { actualiserSalonObjectif } from "../objectifSalon";
import { genererCarteDepart } from "../leaveCard";

const SALON_LEAVE = "🛫・leave-solaria";

async function envoyerMessageDepart(member: GuildMember | PartialGuildMember) {
  const salon = member.guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name === SALON_LEAVE
  );

  if (!salon || salon.type !== ChannelType.GuildText) {
    console.error(`⚠️ Salon "${SALON_LEAVE}" introuvable pour le message de départ.`);
    return;
  }

  const messageTexte = `👋 **${member.user.username}** a quitté le serveur.`;

  try {
    const carte = await genererCarteDepart({
      user: member.user,
      nomServeur: member.guild.name,
      nombreMembresRestants: member.guild.memberCount,
    });
    await salon.send({ content: messageTexte, files: [carte] });
  } catch (err) {
    console.error("⚠️ Erreur carte de départ, envoi du texte seul :", err);
    await salon.send(messageTexte).catch(() => null);
  }
}

export async function handleGuildMemberRemove(
  member: GuildMember | PartialGuildMember
) {
  // Message + carte de départ
  envoyerMessageDepart(member).catch((err) =>
    console.error("⚠️ Erreur envoyerMessageDepart :", err)
  );

  // Actualisation du salon compteur de membres
  actualiserSalonCompteur(member.guild).catch((err) =>
    console.error("⚠️ Erreur actualiserSalonCompteur (départ) :", err)
  );

  // On actualise aussi l'objectif (la barre de progression doit refléter le vrai nombre)
  actualiserSalonObjectif(member.guild).catch((err) =>
    console.error("⚠️ Erreur actualiserSalonObjectif (départ) :", err)
  );
}