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

  if (config.objectiveReached) return;

  const nbMembresActuels = member.guild.memberCount;
  if (nbMembresActuels < config.objectiveTarget) return;

  await prisma.guild.update({
    where: { id: guildId },
    data: { objectiveReached: true },
  });

  try {
    const proprietaire = await member.client.users.fetch(ID_PROPRIETAIRE);
    await proprietaire.send(
      `🎯 **Objectif atteint !** Le serveur **${member.guild.name}** vient d'atteindre **${config.objectiveTarget} membres** !\n\n` +
        `📝 Objectif qui vient d'être rempli :\n> ${config.objectiveDescription}\n\n` +
        `Utilise \`/setobjectif\` pour fixer le prochain objectif.`
    );
  } catch (err) {
    console.error("⚠️ Impossible d'envoyer le MP d'objectif atteint :", err);
  }
}

export async function handleGuildMemberAdd(member: GuildMember) {
  const guildId = member.guild.id;
  console.log(`👋 Nouveau membre détecté : ${member.user.tag} sur le serveur ${member.guild.name}`);

  // On récupère la configuration de bienvenue de ce serveur
  const guildConfig = await prisma.guild.findUnique({
    where: { id: guildId },
  });

  if (!guildConfig) {
    console.log(`⚠️ Aucune configuration trouvée en base de données pour le serveur ${guildId}`);
  } else {
    console.log(`🔍 Configuration trouvée - welcomeChannelId : ${guildConfig.welcomeChannelId || "Non configuré"}`);
  }

  if (guildConfig?.welcomeChannelId) {
    const salonBienvenue = await member.guild.channels
      .fetch(guildConfig.welcomeChannelId)
      .catch((err) => {
        console.error("⚠️ Impossible de fetch le salon de bienvenue :", err);
        return null;
      });

    if (salonBienvenue && salonBienvenue.isTextBased()) {
      const messagePersonnalise = guildConfig.welcomeMessage
        ? guildConfig.welcomeMessage.replace("{membre}", `<@${member.id}>`)
        : `Bienvenue <@${member.id}> !`;

      try {
        console.log("🎨 Génération de la carte de bienvenue...");
        const carte = await genererCarteBienvenue(member);
        await salonBienvenue.send({ content: messagePersonnalise, files: [carte] });
        console.log("✅ Message et carte de bienvenue envoyés avec succès !");
      } catch (err) {
        console.error("⚠️ Erreur carte de bienvenue, tentative d'envoi du texte seul :", err);
        await salonBienvenue.send(messagePersonnalise).catch((e) => {
          console.error("❌ Échec total de l'envoi du message de bienvenue :", e);
        });
      }
    } else {
      console.log("⚠️ Le salon de bienvenue configuré est introuvable ou n'est pas textuel.");
    }
  }

  // On attribue automatiquement le rôle "Non vérifié" si configuré
  if (guildConfig?.unverifiedRoleId) {
    await member.roles.add(guildConfig.unverifiedRoleId).catch((err) => {
      console.error("⚠️ Erreur attribution rôle non vérifié :", err);
    });
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

  // Vérification de l'objectif de membres
  verifierObjectif(member).catch((err) =>
    console.error("⚠️ Erreur verifierObjectif :", err)
  );

  // Actualisation du salon objectif
  actualiserSalonObjectif(member.guild).catch((err) =>
    console.error("⚠️ Erreur actualiserSalonObjectif :", err)
  );

  // Actualisation du salon compteur de membres
  actualiserSalonCompteur(member.guild).catch((err) =>
    console.error("⚠️ Erreur actualiserSalonCompteur :", err)
  );
}
