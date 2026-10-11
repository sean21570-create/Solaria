import { GuildMember, EmbedBuilder } from "discord.js";
import { detecterRaid, activerLockdown, estEnLockdown } from "../antiraid";
import { sendLog } from "../logger";
import { prisma } from "../prisma";
import { actualiserSalonObjectif } from "../objectifSalon";
import { genererCarteBienvenue } from "../welcomeCard";
import { actualiserSalonCompteur } from "../memberCountChannel";

// Âge minimum du compte Discord pour être considéré "normal" (en millisecondes)
const AGE_COMPTE_SUSPECT = 3 * 24 * 60 * 60 * 1000; // 3 jours

// ID Discord de la personne à prévenir en MP quand l'objectif est atteint
const ID_PROPRIETAIRE = "1386295946119479316";

async function verifierObjectif(member: GuildMember) {
  const guildId = member.guild.id;

  const config = await prisma.guild.upsert({
    where: { id: guildId },
    update: {},
    create: { id: guildId, name: member.guild.name },
  });

  if (config.objectiveReached) return; // Déjà atteint et déjà notifié, on ne refait rien

  const nbMembresActuels = member.guild.memberCount;

  if (nbMembresActuels < config.objectiveTarget) return; // Pas encore atteint

  // Objectif atteint : on marque comme fait pour ne plus jamais renvoyer le MP
  await prisma.guild.update({
    where: { id: guildId },
    data: { objectiveReached: true },
  });

  try {
    const proprietaire = await member.client.users.fetch(ID_PROPRIETAIRE);
    await proprietaire.send(
      `🎯 **Objectif atteint !** Le serveur **${member.guild.name}** vient d'atteindre **${config.objectiveTarget} membres** !\n\n` +
        `📝 Objectif qui vient d'être rempli :\n> ${config.objectiveDescription}\n\n` +
        `Utilise \`/setobjectif\` pour fixer le prochain objectif (nombre de membres + description).`
    );
  } catch (err) {
    console.error("⚠️ Impossible d'envoyer le MP d'objectif atteint :", err);
  }
}

export async function handleGuildMemberAdd(member: GuildMember) {
  const guildId = member.guild.id;
  // On récupère la configuration de bienvenue de ce serveur
  const guildConfig = await prisma.guild.findUnique({
    where: { id: guildId },
  });

  if (guildConfig?.welcomeChannelId) {
    const salonBienvenue = await member.guild.channels
      .fetch(guildConfig.welcomeChannelId)
      .catch(() => null);

    if (salonBienvenue && salonBienvenue.isTextBased()) {
      const messagePersonnalise = guildConfig.welcomeMessage
        ? guildConfig.welcomeMessage.replace("{membre}", `<@${member.id}>`)
        : `Bienvenue <@${member.id}> !`;

      try {
        const carte = await genererCarteBienvenue(member);
        await salonBienvenue.send({ content: messagePersonnalise, files: [carte] });
      } catch (err) {
        console.error("⚠️ Erreur carte de bienvenue, envoi du texte seul :", err);
        await salonBienvenue.send(messagePersonnalise).catch(() => null);
      }
    }
  }

  // On attribue automatiquement le rôle "Non vérifié" si configuré
  if (guildConfig?.unverifiedRoleId) {
    await member.roles.add(guildConfig.unverifiedRoleId).catch(() => null);
  }

  // Si le serveur est déjà en lockdown, on kick automatiquement les nouveaux arrivants
  if (estEnLockdown(guildId)) {
    await member.kick("Lockdown actif (raid en cours)").catch(() => null);
    return;
  }

  // On vérifie si ce membre a un compte Discord très récent (suspect)
  const ageCompte = Date.now() - member.user.createdTimestamp;
  const compteSuspect = ageCompte < AGE_COMPTE_SUSPECT;

  // On détecte si trop de membres arrivent d'un coup
  const raidDetecte = detecterRaid(guildId);

  if (raidDetecte) {
    activerLockdown(guildId);

    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("🚨 RAID DÉTECTÉ — Lockdown activé automatiquement")
      .setDescription(
        "Trop de membres ont rejoint le serveur en peu de temps. Le lockdown est activé : les nouveaux arrivants seront automatiquement expulsés jusqu'à désactivation manuelle."
      )
      .setTimestamp();

    await sendLog(member.guild, embed);
  }

  if (compteSuspect) {
    const embed = new EmbedBuilder()
      .setColor(0xffaa00)
      .setTitle("⚠️ Compte suspect détecté")
      .addFields(
        { name: "Membre", value: `<@${member.id}>`, inline: true },
        {
          name: "Âge du compte",
          value: `${Math.floor(ageCompte / (24 * 60 * 60 * 1000))} jour(s)`,
          inline: true,
        }
      )
      .setTimestamp();

    await sendLog(member.guild, embed);
  }

  // Vérification de l'objectif de membres (après tout le reste, ne bloque rien en cas d'erreur)
  verifierObjectif(member).catch((err) =>
    console.error("⚠️ Erreur verifierObjectif :", err)
  );

  // Actualisation du salon objectif (message toujours à jour)
  actualiserSalonObjectif(member.guild).catch((err) =>
    console.error("⚠️ Erreur actualiserSalonObjectif :", err)
  );

  // Actualisation du salon compteur de membres
  actualiserSalonCompteur(member.guild).catch((err) =>
    console.error("⚠️ Erreur actualiserSalonCompteur :", err)
  );
}