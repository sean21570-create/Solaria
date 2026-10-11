import { Message, EmbedBuilder, ChannelType } from "discord.js";
import { prisma } from "../prisma";
import { sendLog } from "../logger";
import { detecterSpam, reinitialiserSpam } from "../antispam";
import { ajouterXp, SALON_NIVEAUX } from "../xpManager";
import { trouverMotInterdit } from "../blacklistMatch";

// ─── Face-reveal ───
const SALON_FACE_REVEAL = "🥖・smash-or-pass";
const MESSAGE_AVERTISSEMENT_FIL =
  "Les insultes, discriminations, et comportement haineux envers cette personne seront sanctionnés.";
const COOLDOWN_FACE_REVEAL_MS = 30 * 60 * 1000; // 30 minutes

const dernierEnvoiFaceReveal = new Map<string, number>();

function formaterDureeRestante(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const secondes = Math.floor((ms % 60000) / 1000);
  if (minutes > 0) return `${minutes} min ${secondes}s`;
  return `${secondes}s`;
}

// ─── XP via messages ───
const COOLDOWN_XP_MS = 20 * 1000; // 20 secondes entre chaque gain d'XP
const XP_MIN_PAR_MESSAGE = 25;
const XP_MAX_PAR_MESSAGE = 40;

const dernierGainXp = new Map<string, number>();

function xpAleatoire(): number {
  return (
    Math.floor(Math.random() * (XP_MAX_PAR_MESSAGE - XP_MIN_PAR_MESSAGE + 1)) +
    XP_MIN_PAR_MESSAGE
  );
}

async function gererXp(message: Message) {
  const userId = message.author.id;

  const maintenant = Date.now();
  const dernierGain = dernierGainXp.get(userId) ?? 0;

  if (maintenant - dernierGain < COOLDOWN_XP_MS) return;
  dernierGainXp.set(userId, maintenant);

  const gain = xpAleatoire();
  await ajouterXp(message.guild!, userId, gain);
}

// ─── Face-reveal ───
async function gererSalonFaceReveal(message: Message): Promise<boolean> {
  if (message.channel.type !== ChannelType.GuildText) return false;
  if (message.channel.name !== SALON_FACE_REVEAL) return false;

  const media = message.attachments.find(
    (att) =>
      att.contentType?.startsWith("image/") || att.contentType?.startsWith("video/")
  );

  if (!media) {
    const suppression = message.delete().catch(() => null);

    message.author
      .send(
        `❌ Ton message dans **#${message.channel.name}** a été supprimé : ce salon n'accepte que les photos et vidéos.`
      )
      .catch(() => null);

    await suppression;
    return true;
  }

  const maintenant = Date.now();
  const prochainEnvoiAutorise = dernierEnvoiFaceReveal.get(message.author.id) ?? 0;

  if (maintenant < prochainEnvoiAutorise) {
    const restant = prochainEnvoiAutorise - maintenant;

    const suppression = message.delete().catch(() => null);

    message.author
      .send(
        `⏳ Tu dois attendre encore **${formaterDureeRestante(restant)}** avant de pouvoir renvoyer une photo/vidéo dans **#${message.channel.name}**.`
      )
      .catch(() => null);

    await suppression;
    return true;
  }

  dernierEnvoiFaceReveal.set(message.author.id, maintenant + COOLDOWN_FACE_REVEAL_MS);

  await message.react("✅").catch(() => null);
  await message.react("❌").catch(() => null);

  try {
    const fil = await message.startThread({
      name: `Discussion — ${message.author.username}`,
      autoArchiveDuration: 1440,
    });

    await fil.send(MESSAGE_AVERTISSEMENT_FIL);
  } catch (err) {
    console.error("⚠️ Impossible de créer le fil face-reveal :", err);
  }

  return true;
}

async function enregistrerStatsMessage(message: Message) {
  const guildId = message.guild!.id;

  await prisma.memberStats
    .upsert({
      where: { guildId_userId: { guildId, userId: message.author.id } },
      update: { messageCount: { increment: 1 } },
      create: { guildId, userId: message.author.id, messageCount: 1 },
    })
    .catch((err) => console.error("⚠️ Erreur enregistrement stats message :", err));

  const membresMentionnes = message.mentions.users.filter(
    (u) => !u.bot && u.id !== message.author.id
  );

  for (const [, utilisateur] of membresMentionnes) {
    await prisma.memberStats
      .upsert({
        where: { guildId_userId: { guildId, userId: utilisateur.id } },
        update: { mentionCount: { increment: 1 } },
        create: { guildId, userId: utilisateur.id, mentionCount: 1 },
      })
      .catch((err) => console.error("⚠️ Erreur enregistrement stats mention :", err));
  }
}

export async function handleMessageCreate(message: Message) {
  if (message.author.bot || !message.guild) return;

  // Sécurité supplémentaire : aucun message autorisé dans le salon des niveaux
  if (
    message.channel.type === ChannelType.GuildText &&
    message.channel.name === SALON_NIVEAUX
  ) {
    await message.delete().catch(() => null);
    return;
  }

  // Stats (messages + mentions)
  enregistrerStatsMessage(message).catch((err) =>
    console.error("⚠️ Erreur enregistrerStatsMessage :", err)
  );

  // XP / Niveaux
  gererXp(message).catch((err) => console.error("⚠️ Erreur gererXp :", err));

  // Gestion spéciale du salon face-reveal
  const traiteParFaceReveal = await gererSalonFaceReveal(message);
  if (traiteParFaceReveal) return;

  const guildId = message.guild.id;

  // Détection de spam (flood de messages)
  if (detecterSpam(message.author.id)) {
    const guildMember = await message.guild.members.fetch(message.author.id).catch(() => null);

    if (guildMember && guildMember.moderatable) {
      await guildMember.timeout(5 * 60 * 1000, "AutoMod : spam détecté").catch(() => null);
      reinitialiserSpam(message.author.id);

      await prisma.guild.upsert({
        where: { id: guildId },
        update: {},
        create: { id: guildId, name: message.guild.name },
      });

      const newCase = await prisma.case.create({
        data: {
          guildId,
          userId: message.author.id,
          moderatorId: message.client.user!.id,
          action: "AUTOMOD_TIMEOUT",
          reason: "Spam détecté (flood de messages)",
          duration: "5 minutes",
        },
      });

      const embedSpam = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle(`🛡️ AutoMod — Anti-Spam — Case #${newCase.id}`)
        .addFields(
          { name: "Membre", value: `<@${message.author.id}>`, inline: true },
          { name: "Action", value: "Timeout 5 minutes", inline: true },
          { name: "Raison", value: "Flood de messages détecté" }
        )
        .setTimestamp();

      await sendLog(message.guild, embedSpam);

      const avertissementSpam = await message.channel.send({
        content: `🚫 <@${message.author.id}> a été mis en timeout pour spam.`,
      });
      setTimeout(() => avertissementSpam.delete().catch(() => null), 5000);
    }

    return;
  }

  const motsInterdits = await prisma.blacklistWord.findMany({
    where: { guildId },
  });

  if (motsInterdits.length === 0) return;

  // Détection par MOT ENTIER : "pd" est détecté, mais pas "pdent" ni "rapide"
  const motDetecte = trouverMotInterdit(
    message.content,
    motsInterdits.map((entry) => entry.word)
  );

  if (!motDetecte) return;

  const motTrouve = { word: motDetecte };

  await message.delete().catch(() => null);

  await prisma.guild.upsert({
    where: { id: guildId },
    update: {},
    create: { id: guildId, name: message.guild.name },
  });

  const newCase = await prisma.case.create({
    data: {
      guildId,
      userId: message.author.id,
      moderatorId: message.client.user!.id,
      action: "AUTOMOD_DELETE",
      reason: `Mot interdit détecté : ${motTrouve.word}`,
    },
  });

  await prisma.infraction.create({
    data: {
      guildId,
      userId: message.author.id,
      type: "WARN",
      reason: `AutoMod : mot interdit (${motTrouve.word})`,
    },
  });

  const embed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle(`🛡️ AutoMod — Case #${newCase.id}`)
    .addFields(
      { name: "Membre", value: `<@${message.author.id}>`, inline: true },
      { name: "Salon", value: `<#${message.channel.id}>`, inline: true },
      { name: "Raison", value: `Mot interdit détecté : \`${motTrouve.word}\`` }
    )
    .setTimestamp();

  await sendLog(message.guild, embed);

  const avertissement = await message.channel.send({
    content: `⚠️ <@${message.author.id}>, ton message a été supprimé (mot interdit).`,
  });
  setTimeout(() => avertissement.delete().catch(() => null), 5000);
}