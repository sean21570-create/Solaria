import { ChatInputCommandInteraction, GuildMember, MessageFlags, SlashCommandBuilder } from "discord.js";
import {
  MESSAGE_ACCES_REFUSE,
  NOM_SALON_MATCH,
  aAccesMatch,
  creerModalCv,
  preparerPhoto,
  trouverSalonMatch,
} from "../match";

export const data = new SlashCommandBuilder()
  .setName("cv")
  .setDescription("Dépose ton CV dans le salon find-a-match 💋")
  .setDMPermission(false)
  .addAttachmentOption((o) =>
    o.setName("photo").setDescription("Ta photo (optionnel, aucun contenu explicite)")
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  if (!aAccesMatch(interaction.member as GuildMember | null)) {
    await interaction.reply({ content: MESSAGE_ACCES_REFUSE, flags: MessageFlags.Ephemeral });
    return;
  }

  if (!trouverSalonMatch(interaction.guild)) {
    await interaction.reply({
      content: `❌ Le salon **${NOM_SALON_MATCH}** est introuvable sur ce serveur.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const erreur = preparerPhoto(interaction.user.id, interaction.options.getAttachment("photo"));
  if (erreur) {
    await interaction.reply({ content: erreur, flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.showModal(creerModalCv());
}