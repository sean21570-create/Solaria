import {
  ChannelType,
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
  SlashCommandBuilder,
  TextChannel,
} from "discord.js";
import { prisma } from "../prisma";
import {
  DUREE_MAX_MS,
  DUREE_MIN_MS,
  boutonParticiper,
  embedGiveaway,
  parseDuree,
  terminerGiveaway,
} from "../giveaway";

// Seuls les membres ayant l'un de ces rôles peuvent utiliser /giveaway
const ROLES_AUTORISES = ["OWNER", "ADMIN"];

export const data = new SlashCommandBuilder()
  .setName("giveaway")
  .setDescription("Gérer les giveaways (OWNER / ADMIN)")
  .setDMPermission(false)
  .addSubcommand((sub) =>
    sub
      .setName("start")
      .setDescription("Lancer un giveaway")
      .addStringOption((o) => o.setName("prix").setDescription("Ce qui est à gagner").setRequired(true).setMaxLength(200))
      .addStringOption((o) =>
        o.setName("duree").setDescription("Durée : 30m, 2h, 1d, 1d12h, 1w...").setRequired(true)
      )
      .addIntegerOption((o) =>
        o.setName("gagnants").setDescription("Nombre de gagnants (défaut : 1)").setMinValue(1).setMaxValue(20)
      )
      .addChannelOption((o) =>
        o
          .setName("salon")
          .setDescription("Salon où lancer le giveaway (défaut : ici)")
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      )
      .addBooleanOption((o) =>
        o.setName("everyone").setDescription("Mentionner @everyone au lancement (défaut : oui)")
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("end")
      .setDescription("Terminer un giveaway maintenant")
      .addIntegerOption((o) => o.setName("id").setDescription("Numéro du giveaway (#id)").setRequired(true).setMinValue(1))
  )
  .addSubcommand((sub) =>
    sub
      .setName("reroll")
      .setDescription("Retirer de nouveaux gagnants")
      .addIntegerOption((o) => o.setName("id").setDescription("Numéro du giveaway (#id)").setRequired(true).setMinValue(1))
  )
  .addSubcommand((sub) => sub.setName("list").setDescription("Voir les giveaways en cours"));

function aLeDroit(interaction: ChatInputCommandInteraction): boolean {
  const membre = interaction.member as GuildMember | null;
  if (!membre?.roles?.cache) return false;
  return membre.roles.cache.some((role) => ROLES_AUTORISES.includes(role.name.toUpperCase()));
}

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  if (!aLeDroit(interaction)) {
    await interaction.reply({
      content: "❌ Seuls les **OWNER** et **ADMIN** peuvent utiliser cette commande.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const sub = interaction.options.getSubcommand();

  // ───────── START ─────────
  if (sub === "start") {
    const prix = interaction.options.getString("prix", true);
    const dureeTexte = interaction.options.getString("duree", true);
    const gagnants = interaction.options.getInteger("gagnants") ?? 1;
    const mentionner = interaction.options.getBoolean("everyone") ?? true;
    const salon = (interaction.options.getChannel("salon") ?? interaction.channel) as TextChannel | null;

    const duree = parseDuree(dureeTexte);
    if (!duree) {
      await interaction.reply({
        content: "❌ Durée invalide. Exemples : `30m`, `2h`, `1d`, `1d12h`, `1w`.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (duree < DUREE_MIN_MS || duree > DUREE_MAX_MS) {
      await interaction.reply({
        content: "❌ La durée doit être comprise entre 10 secondes et 30 jours.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (!salon || !salon.isTextBased()) {
      await interaction.reply({ content: "❌ Salon invalide.", flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const g = await prisma.giveaway.create({
      data: {
        guildId: interaction.guild.id,
        channelId: salon.id,
        prize: prix,
        winnerCount: gagnants,
        hostId: interaction.user.id,
        endsAt: new Date(Date.now() + duree),
      },
    });

    try {
      const message = await salon.send({
        content: mentionner ? "@everyone 🎉 **Nouveau giveaway !**" : undefined,
        embeds: [embedGiveaway(g, 0)],
        components: [boutonParticiper(g.id)],
        allowedMentions: mentionner ? { parse: ["everyone"] } : { parse: [] },
      });
      await prisma.giveaway.update({ where: { id: g.id }, data: { messageId: message.id } });
      await interaction.editReply(`✅ Giveaway **#${g.id}** lancé dans <#${salon.id}> : ${message.url}`);
    } catch (err) {
      console.error("❌ Impossible d'envoyer le message du giveaway :", err);
      await prisma.giveaway.delete({ where: { id: g.id } }).catch(() => null);
      await interaction.editReply(
        "❌ Impossible d'envoyer le giveaway dans ce salon. Vérifie que le bot peut voir le salon, y écrire et intégrer des liens."
      );
    }
    return;
  }

  // ───────── END ─────────
  if (sub === "end") {
    const id = interaction.options.getInteger("id", true);
    const g = await prisma.giveaway.findUnique({ where: { id } });
    if (!g || g.guildId !== interaction.guild.id) {
      await interaction.reply({ content: "❌ Giveaway introuvable sur ce serveur.", flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const res = await terminerGiveaway(interaction.client, id);
    await interaction.editReply(res.ok ? `✅ Giveaway **#${id}** terminé.` : `❌ ${res.raison}`);
    return;
  }

  // ───────── REROLL ─────────
  if (sub === "reroll") {
    const id = interaction.options.getInteger("id", true);
    const g = await prisma.giveaway.findUnique({ where: { id } });
    if (!g || g.guildId !== interaction.guild.id) {
      await interaction.reply({ content: "❌ Giveaway introuvable sur ce serveur.", flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const res = await terminerGiveaway(interaction.client, id, true);
    await interaction.editReply(res.ok ? `🔄 Nouveau tirage effectué pour le giveaway **#${id}**.` : `❌ ${res.raison}`);
    return;
  }

  // ───────── LIST ─────────
  if (sub === "list") {
    const actifs = await prisma.giveaway.findMany({
      where: { guildId: interaction.guild.id, ended: false },
      orderBy: { endsAt: "asc" },
      include: { _count: { select: { entries: true } } },
    });

    if (!actifs.length) {
      await interaction.reply({ content: "Aucun giveaway en cours.", flags: MessageFlags.Ephemeral });
      return;
    }

    const lignes = actifs.map((g) => {
      const ts = Math.floor(g.endsAt.getTime() / 1000);
      return `**#${g.id}** · ${g.prize} · <#${g.channelId}> · fin <t:${ts}:R> · 👥 ${g._count.entries}`;
    });

    await interaction.reply({
      content: `🎉 **Giveaways en cours :**\n${lignes.join("\n")}`,
      flags: MessageFlags.Ephemeral,
    });
  }
}