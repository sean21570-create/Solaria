import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { prisma } from "../prisma";
import { rangDuMembre, xpRequisPourNiveau, xpTotal } from "../xpManager";

export const data = new SlashCommandBuilder()
  .setName("level")
  .setDescription("Affiche ton niveau et ta progression d'XP")
  .addUserOption((option) =>
    option
      .setName("membre")
      .setDescription("Le membre à consulter (toi par défaut)")
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const utilisateurCible = interaction.options.getUser("membre") ?? interaction.user;
  const guildId = interaction.guildId!;

  const donnees = await prisma.levelData.findUnique({
    where: { guildId_userId: { guildId, userId: utilisateurCible.id } },
  });

  const niveau = donnees?.level ?? 0;
  const xpActuel = donnees?.xp ?? 0;
  const xpRequis = xpRequisPourNiveau(niveau);
  const pourcentage = Math.min(100, Math.floor((xpActuel / xpRequis) * 100));

  const nbBarres = 20;
  const barresRemplies = Math.round((pourcentage / 100) * nbBarres);
  const barre = "🟦".repeat(barresRemplies) + "⬜".repeat(nbBarres - barresRemplies);

  // Classement : niveau le plus haut d'abord, puis XP dans le niveau
  const rang = donnees ? await rangDuMembre(guildId, niveau, xpActuel) : null;
  const totalClasses = await prisma.levelData.count({ where: { guildId } });

  const embed = new EmbedBuilder()
    .setColor(0x00d4ff)
    .setTitle(`📈 Niveau de ${utilisateurCible.username}`)
    .setThumbnail(utilisateurCible.displayAvatarURL())
    .addFields(
      { name: "Niveau actuel", value: `${niveau}`, inline: true },
      { name: "XP", value: `${xpActuel} / ${xpRequis}`, inline: true },
      {
        name: "Classement",
        value: rang ? `**#${rang}** sur ${totalClasses}` : "Non classé",
        inline: true,
      },
      { name: "Progression", value: `${barre} (${pourcentage}%)` },
      { name: "XP total gagné", value: `${xpTotal(niveau, xpActuel).toLocaleString("fr-FR")} XP` }
    )
    .setFooter({ text: `Demandé par ${interaction.user.tag}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}