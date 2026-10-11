import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js";
import { prisma } from "../prisma";

export const data = new SlashCommandBuilder()
  .setName("history")
  .setDescription("Voir l'historique de modération d'un membre")
  .addUserOption((option) =>
    option.setName("membre").setDescription("Le membre à consulter").setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

export async function execute(interaction: ChatInputCommandInteraction) {
  const membre = interaction.options.getUser("membre", true);
  const guildId = interaction.guildId!;

  // On récupère les 10 derniers cases de ce membre sur ce serveur, du plus récent au plus ancien
  const cases = await prisma.case.findMany({
    where: { guildId, userId: membre.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  if (cases.length === 0) {
    await interaction.reply({
      content: `✅ ${membre.tag} n'a aucun historique de modération sur ce serveur.`,
      ephemeral: true,
    });
    return;
  }

  const iconesParAction: Record<string, string> = {
    WARN: "⚠️",
    TIMEOUT: "🔇",
    KICK: "👢",
    BAN: "🔨",
    UNBAN: "✅",
  };

  const description = cases
    .map((c) => {
      const icone = iconesParAction[c.action] || "📋";
      const date = c.createdAt.toLocaleDateString("fr-FR");
      return `${icone} **Case #${c.id}** — ${c.action} — ${date}\n> ${c.reason}`;
    })
    .join("\n\n");

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📋 Historique de ${membre.tag}`)
    .setDescription(description)
    .setFooter({ text: `${cases.length} dossier(s) affiché(s) (10 max)` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}