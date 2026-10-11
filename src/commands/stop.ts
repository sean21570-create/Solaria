import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { arreterMusique, getMusicState } from "../music";

export const data = new SlashCommandBuilder()
  .setName("stop")
  .setDescription("Arrêter la musique et déconnecter le bot du vocal");

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId!;

  const state = getMusicState(guildId);

  if (!state) {
    await interaction.reply({
      content: "❌ Aucune musique n'est en cours de lecture.",
      ephemeral: true,
    });
    return;
  }

  arreterMusique(guildId);

  await interaction.reply("⏹️ Musique arrêtée, déconnecté du vocal.");
}