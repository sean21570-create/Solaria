import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Guild,
  MessageFlags,
} from "discord.js";
import { prisma } from "./prisma";
import { BONUS_MAX, compterInvitesValides } from "./invites";

type GiveawayDb = NonNullable<Awaited<ReturnType<typeof prisma.giveaway.findUnique>>>;

const UNITES_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
};

export const DUREE_MIN_MS = 10 * 1000;
export const DUREE_MAX_MS = 30 * UNITES_MS.d;

// "30m", "2h", "1d12h", "1w" → millisecondes (ou null si invalide)
export function parseDuree(texte: string): number | null {
  const propre = texte.replace(/\s+/g, "").toLowerCase();
  if (!/^(\d+[smhdw])+$/.test(propre)) return null;

  let total = 0;
  for (const m of propre.matchAll(/(\d+)([smhdw])/g)) {
    total += Number(m[1]) * UNITES_MS[m[2]];
  }
  return total > 0 ? total : null;
}

export function boutonParticiper(id: number, desactive = false) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`giveaway_join:${id}`)
      .setLabel("Participer")
      .setEmoji("🎉")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(desactive)
  );
}

export function embedGiveaway(g: GiveawayDb, participants: number, gagnants?: string[]) {
  const ts = Math.floor(g.endsAt.getTime() / 1000);
  const embed = new EmbedBuilder()
    .setTitle(`🎉 ${g.prize}`)
    .setFooter({ text: `Giveaway #${g.id}` });

  if (!g.ended) {
    embed
      .setColor(0x5865f2)
      .setDescription(
        [
          "Clique sur le bouton ci-dessous pour participer !",
          "",
          `📨 **Plus tu invites de monde, plus tu as de chances !**`,
          `Chaque personne invitée sur le serveur pendant le giveaway = **+1 chance** (max +${BONUS_MAX}).`,
          "",
          `⏰ Fin : <t:${ts}:R> (<t:${ts}:F>)`,
          `👑 Organisateur : <@${g.hostId}>`,
          `🏆 Gagnants : **${g.winnerCount}**`,
          `👥 Participants : **${participants}**`,
        ].join("\n")
      );
  } else {
    const liste = gagnants?.length ? gagnants.map((id) => `<@${id}>`).join(", ") : "Aucun participant valide 😢";
    embed
      .setColor(0x99aab5)
      .setDescription(
        [
          "**Giveaway terminé !**",
          "",
          `🏆 Gagnant(s) : ${liste}`,
          `👑 Organisateur : <@${g.hostId}>`,
          `👥 Participants : **${participants}**`,
          `⏰ Terminé : <t:${ts}:R>`,
        ].join("\n")
      );
  }

  return embed;
}

// Tirage pondéré : chaque participant a 1 chance + 1 par invitation valide (limité à BONUS_MAX)
async function tirerGagnants(guild: Guild, g: GiveawayDb, userIds: string[], nombre: number): Promise<string[]> {
  const candidats: { id: string; poids: number }[] = [];

  for (const userId of userIds) {
    const membre = await guild.members.fetch(userId).catch(() => null);
    if (!membre || membre.user.bot) continue;

    const bonus = await compterInvitesValides(guild, userId, g.createdAt, g.endsAt).catch(() => 0);
    candidats.push({ id: userId, poids: 1 + Math.min(bonus, BONUS_MAX) });
  }

  const gagnants: string[] = [];
  while (gagnants.length < nombre && candidats.length > 0) {
    const total = candidats.reduce((somme, c) => somme + c.poids, 0);
    let tirage = Math.random() * total;

    let index = candidats.findIndex((c) => {
      tirage -= c.poids;
      return tirage < 0;
    });
    if (index === -1) index = candidats.length - 1;

    gagnants.push(candidats[index].id);
    candidats.splice(index, 1);
  }

  return gagnants;
}

export async function terminerGiveaway(
  client: Client,
  id: number,
  reroll = false
): Promise<{ ok: boolean; raison?: string; gagnants?: string[] }> {
  const existant = await prisma.giveaway.findUnique({ where: { id } });
  if (!existant) return { ok: false, raison: "Giveaway introuvable." };

  if (reroll) {
    if (!existant.ended) return { ok: false, raison: "Ce giveaway n'est pas encore terminé." };
  } else {
    // Réservation atomique : évite qu'un /giveaway end et le minuteur le terminent deux fois
    const reserve = await prisma.giveaway.updateMany({
      where: { id, ended: false },
      data: { ended: true },
    });
    if (reserve.count === 0) return { ok: false, raison: "Ce giveaway est déjà terminé." };
  }

  const g = await prisma.giveaway.findUniqueOrThrow({ where: { id }, include: { entries: true } });

  const guild = client.guilds.cache.get(g.guildId) ?? (await client.guilds.fetch(g.guildId).catch(() => null));
  if (!guild) return { ok: false, raison: "Serveur introuvable." };

  const gagnants = await tirerGagnants(
    guild,
    g,
    g.entries.map((e) => e.userId),
    g.winnerCount
  );

  await prisma.giveaway.update({ where: { id }, data: { winnerIds: gagnants } });
  const maj: GiveawayDb = { ...g, ended: true, winnerIds: gagnants };

  const salon = await guild.channels.fetch(g.channelId).catch(() => null);
  if (!salon || !salon.isTextBased()) {
    return { ok: true, gagnants, raison: "Le salon du giveaway n'existe plus, gagnants tirés mais non annoncés." };
  }

  // Mise à jour du message d'origine
  if (g.messageId) {
    const message = await salon.messages.fetch(g.messageId).catch(() => null);
    if (message) {
      await message
        .edit({
          embeds: [embedGiveaway(maj, g.entries.length, gagnants)],
          components: [boutonParticiper(g.id, true)],
        })
        .catch(() => null);
    }
  }

  // Annonce
  const lien = g.messageId ? `https://discord.com/channels/${g.guildId}/${g.channelId}/${g.messageId}` : null;
  const annonce = gagnants.length
    ? `🎊 Félicitations ${gagnants.map((u) => `<@${u}>`).join(", ")} ! Vous avez gagné **${g.prize}** !${lien ? `\n${lien}` : ""}`
    : `😢 Personne n'a participé au giveaway **${g.prize}**.`;

  if ("send" in salon) {
    await salon
      .send({ content: annonce, allowedMentions: { users: gagnants } })
      .catch((err: unknown) => console.error("⚠️ Impossible d'annoncer les gagnants :", err));
  }

  return { ok: true, gagnants };
}

// Gère le clic sur le bouton "Participer" (clic de nouveau = se retirer)
export async function gererBoutonGiveaway(interaction: ButtonInteraction) {
  const id = Number(interaction.customId.split(":")[1]);
  if (!Number.isInteger(id)) return;

  const g = await prisma.giveaway.findUnique({ where: { id } });
  if (!g || g.ended || g.endsAt.getTime() <= Date.now()) {
    await interaction.reply({ content: "❌ Ce giveaway est terminé.", flags: MessageFlags.Ephemeral });
    return;
  }

  const existant = await prisma.giveawayEntry.findUnique({
    where: { giveawayId_userId: { giveawayId: id, userId: interaction.user.id } },
  });

  let retire = false;
  if (existant) {
    await prisma.giveawayEntry.delete({ where: { id: existant.id } });
    retire = true;
  } else {
    await prisma.giveawayEntry.create({ data: { giveawayId: id, userId: interaction.user.id } });
  }

  const participants = await prisma.giveawayEntry.count({ where: { giveawayId: id } });
  await interaction.update({ embeds: [embedGiveaway(g, participants)] });

  if (retire) {
    await interaction.followUp({ content: "↩️ Ta participation a été retirée.", flags: MessageFlags.Ephemeral });
    return;
  }

  // On indique au participant combien de chances il a grâce à ses invitations
  let bonus = 0;
  if (interaction.guild) {
    bonus = await compterInvitesValides(interaction.guild, interaction.user.id, g.createdAt, g.endsAt).catch(() => 0);
  }
  const chances = 1 + Math.min(bonus, BONUS_MAX);

  await interaction.followUp({
    content:
      `✅ Tu participes au giveaway, bonne chance ! 🍀\n` +
      `🎟️ Tu as **${chances}** chance${chances > 1 ? "s" : ""} (1 de base + ${chances - 1} grâce à tes invitations).\n` +
      `📨 Invite des amis sur le serveur pour augmenter tes chances !`,
    flags: MessageFlags.Ephemeral,
  });
}

// Vérifie toutes les 15 secondes si un giveaway doit se terminer (survit aux redémarrages)
export function demarrerVerificationGiveaways(client: Client) {
  const verifier = async () => {
    try {
      const aTerminer = await prisma.giveaway.findMany({
        where: { ended: false, endsAt: { lte: new Date() } },
        select: { id: true },
      });
      for (const { id } of aTerminer) {
        const res = await terminerGiveaway(client, id);
        console.log(`🎉 Giveaway #${id} terminé automatiquement (${res.ok ? "ok" : res.raison}).`);
      }
    } catch (err) {
      console.error("⚠️ Erreur vérification des giveaways :", err);
    }
  };

  verifier();
  setInterval(verifier, 15_000);
  console.log("🎉 Système de giveaway actif");
}