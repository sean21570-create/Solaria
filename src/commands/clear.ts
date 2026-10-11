import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
  ChannelType,
  TextChannel,
} from "discord.js";

const NOM_ROLE_AUTORISE = "OWNER";

export const data = new SlashCommandBuilder()
  .setName("clear")
  .setDescription("Vide entièrement le salon (supprime tous les messages)");

export async function execute(interaction: ChatInputCommandInteraction) {
  const membre = interaction.member as GuildMember;

  const aLeRole = membre.roles.cache.some((role) => role.name === NOM_ROLE_AUTORISE);

  if (!aLeRole) {
    await interaction.reply({
      content: `❌ Seuls les membres avec le rôle **@${NOM_ROLE_AUTORISE}** peuvent utiliser cette commande.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const salon = interaction.channel;

  if (!salon || salon.type !== ChannelType.GuildText) {
    await interaction.reply({
      content: "❌ Cette commande ne fonctionne que dans un salon textuel.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.reply({
    content: "🧹 Vidage du salon en cours...",
    flags: MessageFlags.Ephemeral,
  });

  const salonTexte = salon as TextChannel;

  try {
    // clone() copie automatiquement : nom, catégorie parente, permissions (overwrites),
    // position, topic, NSFW, slowmode, et le type de salon.
    const nouveauSalon = await salonTexte.clone({
      name: salonTexte.name,
      reason: `Clear demandé par ${interaction.user.tag}`,
    });

    // On s'assure explicitement que la position et la catégorie sont bien identiques
    await nouveauSalon.setParent(salonTexte.parentId, {
      lockPermissions: false, // on garde les permissions déjà clonées, pas celles de la catégorie
    }).catch(() => null);

    await nouveauSalon.setPosition(salonTexte.position).catch(() => null);

    await salonTexte.delete(`Clear demandé par ${interaction.user.tag}`).catch(() => null);

    await nouveauSalon.send(
      `🧹 Salon vidé par <@${interaction.user.id}>.`
    );
  } catch (err) {
    console.error("❌ Erreur lors du /clear :", err);
    await interaction.followUp({
      content: "❌ Une erreur est survenue en essayant de vider le salon.",
      flags: MessageFlags.Ephemeral,
    }).catch(() => null);
  }
}