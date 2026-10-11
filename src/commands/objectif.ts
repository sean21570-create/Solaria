import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { prisma } from "../prisma";

export const data = new SlashCommandBuilder()
  .setName("objectif")
  .setDescription("Affiche l'objectif de membres actuel du serveur");

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId!;

  const config = await prisma.guild.upsert({
    where: { id: guildId },
    update: {},
    create: { id: guildId, name: interaction.guild?.name },
  });

  const nbMembresActuels = interaction.guild?.memberCount ?? 0;
  const objectif = config.objectiveTarget;
  const pourcentage = Math.min(100, Math.floor((nbMembresActuels / objectif) * 100));

  const nbBarres = 20;
  const barresRemplies = Math.round((pourcentage / 100) * nbBarres);
  const barre = "🟩".repeat(barresRemplies) + "⬜".repeat(nbBarres - barresRemplies);

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("🎯 Objectif du serveur")
    .setDescription(config.objectiveDescription)
    .addFields(
      { name: "Membres actuels", value: `${nbMembresActuels} / ${objectif}`, inline: true },
      { name: "Progression", value: `${barre} (${pourcentage}%)` }
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}