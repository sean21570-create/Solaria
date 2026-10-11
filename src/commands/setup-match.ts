import {
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { NOM_SALON_MATCH, publierPanneau, trouverSalonMatch } from "../match";

const ROLES_AUTORISES = ["OWNER", "ADMIN"];

export const data = new SlashCommandBuilder()
  .setName("setup-match")
  .setDescription("Poste le panneau « Déposer son CV » dans find-a-match (OWNER / ADMIN)")
  .setDMPermission(false);

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  const membre = interaction.member as GuildMember | null;
  const autorise = membre?.roles?.cache?.some((r) => ROLES_AUTORISES.includes(r.name.toUpperCase())) ?? false;
  if (!autorise) {
    await interaction.reply({
      content: "❌ Seuls les **OWNER** et **ADMIN** peuvent utiliser cette commande.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const salon = trouverSalonMatch(interaction.guild);
  if (!salon) {
    await interaction.reply({
      content: `❌ Salon introuvable : il doit y avoir un salon texte dont le nom contient "${NOM_SALON_MATCH}".`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const res = await publierPanneau(salon, interaction.client);
    await interaction.editReply(
      `✅ Panneau publié : ${res.lien}\n` +
        (res.verrouille
          ? "🔒 Salon verrouillé : seuls les OWNER et le bot peuvent y écrire."
          : "⚠️ Je n'ai pas pu verrouiller le salon (il me faut la permission **Gérer les salons** / **Gérer les rôles**). Retire toi-même *Envoyer des messages* à @everyone dans ce salon.") +
        (res.banniere ? "\n🖼️ Bannière `assets/find-a-match.png` ajoutée." : "\n🖼️ Pas de bannière : ajoute `assets/find-a-match.png` puis refais `/setup-match` pour l'afficher.")
    );
  } catch (err) {
    console.error("❌ Impossible de publier le panneau find-a-match :", err);
    await interaction.editReply(
      "❌ Impossible de publier le panneau. Le bot doit pouvoir voir le salon, y écrire, intégrer des liens et joindre des fichiers."
    );
  }
}