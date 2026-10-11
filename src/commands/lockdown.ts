import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js";
import { activerLockdown, desactiverLockdown } from "../antiraid";

export const data = new SlashCommandBuilder()
  .setName("mode-lockdown")
  .setDescription("Activer ou désactiver le mode lockdown (anti-raid)")
  .addStringOption((option) =>
    option
      .setName("etat")
      .setDescription("Activer ou désactiver")
      .setRequired(true)
      .addChoices(
        { name: "Activer", value: "on" },
        { name: "Désactiver", value: "off" }
      )
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction) {
  const etat = interaction.options.getString("etat", true);
  const guildId = interaction.guildId!;

  if (etat === "on") {
    activerLockdown(guildId);
  } else {
    desactiverLockdown(guildId);
  }

  const embed = new EmbedBuilder()
    .setColor(etat === "on" ? 0xff0000 : 0x00cc66)
    .setTitle(etat === "on" ? "🔒 Lockdown activé" : "🔓 Lockdown désactivé")
    .setDescription(
      etat === "on"
        ? "Les nouveaux membres seront automatiquement expulsés."
        : "Le serveur accepte à nouveau normalement les nouveaux membres."
    );

  await interaction.reply({ embeds: [embed] });
}