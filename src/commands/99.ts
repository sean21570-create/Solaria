import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
  ChannelType,
  EmbedBuilder,
} from "discord.js";
import { prisma } from "../prisma";

const NOM_ROLE_AUTORISE = "OWNER";
const NIVEAU_CIBLE = 99999;
const SALON_NIVEAUX = "📈・niveaux";

export const data = new SlashCommandBuilder()
  .setName("level99")
  .setDescription("Passe directement au niveau 99999 (réservé aux OWNER)");

export async function execute(interaction: ChatInputCommandInteraction) {
  const membre = interaction.member as GuildMember;
  const guildId = interaction.guildId!;

  const aLeRole = membre.roles.cache.some((role) => role.name === NOM_ROLE_AUTORISE);

  if (!aLeRole) {
    await interaction.reply({
      content: `❌ Seuls les membres avec le rôle **@${NOM_ROLE_AUTORISE}** peuvent utiliser cette commande.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await prisma.levelData.upsert({
    where: { guildId_userId: { guildId, userId: membre.id } },
    update: { level: NIVEAU_CIBLE, xp: 0 },
    create: { guildId, userId: membre.id, level: NIVEAU_CIBLE, xp: 0 },
  });

  await interaction.reply({
    content: "✅ Niveau mis à jour.",
    flags: MessageFlags.Ephemeral,
  });

  const salon = interaction.guild?.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name === SALON_NIVEAUX
  );

  if (!salon || salon.type !== ChannelType.GuildText) {
    console.error(`⚠️ Salon "${SALON_NIVEAUX}" introuvable pour l'annonce /level99.`);
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle("👑 LEVEL UP !")
    .setDescription(`${membre} vient de passer **niveau ${NIVEAU_CIBLE}** !`)
    .setThumbnail(membre.user.displayAvatarURL())
    .setTimestamp();

  // Aucun ping
  await salon
    .send({ embeds: [embed], allowedMentions: { parse: [] } })
    .catch((err) => console.error("⚠️ Impossible d'envoyer l'annonce /level99 :", err));
}