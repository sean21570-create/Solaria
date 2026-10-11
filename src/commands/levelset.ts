import {
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { prisma } from "../prisma";

const NOM_ROLE_AUTORISE = "OWNER";
const NIVEAU_MAX = 99999;

export const data = new SlashCommandBuilder()
  .setName("levelset")
  .setDescription("Définir le niveau exact d'un membre (réservé aux OWNER)")
  .setDMPermission(false)
  .addUserOption((o) =>
    o.setName("membre").setDescription("Le membre à modifier").setRequired(true)
  )
  .addIntegerOption((o) =>
    o
      .setName("niveau")
      .setDescription(`Le niveau à lui donner (0 à ${NIVEAU_MAX})`)
      .setRequired(true)
      .setMinValue(0)
      .setMaxValue(NIVEAU_MAX)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const guild = interaction.guild;
  if (!guild) return;

  const auteur = interaction.member as GuildMember | null;
  const aLeRole = auteur?.roles?.cache?.some((r) => r.name === NOM_ROLE_AUTORISE) ?? false;

  if (!aLeRole) {
    await interaction.reply({
      content: `❌ Seuls les membres avec le rôle **@${NOM_ROLE_AUTORISE}** peuvent utiliser cette commande.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const cible = interaction.options.getUser("membre", true);
  const niveau = interaction.options.getInteger("niveau", true);

  if (cible.bot) {
    await interaction.reply({ content: "❌ Un bot n'a pas de niveau.", flags: MessageFlags.Ephemeral });
    return;
  }

  const membre = await guild.members.fetch(cible.id).catch(() => null);
  if (!membre) {
    await interaction.reply({ content: "❌ Ce membre n'est pas sur le serveur.", flags: MessageFlags.Ephemeral });
    return;
  }

  const ancien = await prisma.levelData.findUnique({
    where: { guildId_userId: { guildId: guild.id, userId: cible.id } },
  });

  await prisma.levelData.upsert({
    where: { guildId_userId: { guildId: guild.id, userId: cible.id } },
    update: { level: niveau, xp: 0 },
    create: { guildId: guild.id, userId: cible.id, level: niveau, xp: 0 },
  });

  await interaction.reply({
    content: `✅ <@${cible.id}> est maintenant **niveau ${niveau}** (avant : niveau ${ancien?.level ?? 0}). Sa progression repart de 0 XP dans ce niveau.`,
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}