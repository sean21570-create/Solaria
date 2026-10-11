import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("ping")
  .setDescription("Vérifie que le bot répond");

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.reply("🏓 Pong !");
}
