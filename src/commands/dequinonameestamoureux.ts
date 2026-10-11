import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("dequinonameestamoureux")
  .setDescription("De qui noname est amoureux ?");

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.reply("# DE GABRIELLE");
}