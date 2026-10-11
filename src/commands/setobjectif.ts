import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
} from "discord.js";
import { prisma } from "../prisma";
import { actualiserSalonObjectif } from "../objectifSalon";

const NOM_ROLE_AUTORISE = "OWNER";

export const data = new SlashCommandBuilder()
  .setName("setobjectif")
  .setDescription("Fixe le prochain objectif de membres (réservé aux OWNER)")
  .addIntegerOption((option) =>
    option
      .setName("nombre")
      .setDescription("Nombre de membres à atteindre")
      .setRequired(true)
      .setMinValue(1)
  )
  .addStringOption((option) =>
    option
      .setName("description")
      .setDescription("Description de l'objectif (ce qui se passera une fois atteint)")
      .setRequired(true)
  );

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

  const nombre = interaction.options.getInteger("nombre", true);
  const description = interaction.options.getString("description", true);

  await prisma.guild.upsert({
    where: { id: guildId },
    update: {
      objectiveTarget: nombre,
      objectiveDescription: description,
      objectiveReached: false,
    },
    create: {
      id: guildId,
      name: interaction.guild?.name,
      objectiveTarget: nombre,
      objectiveDescription: description,
      objectiveReached: false,
    },
  });

  if (interaction.guild) {
    await actualiserSalonObjectif(interaction.guild).catch((err) =>
      console.error("⚠️ Erreur actualiserSalonObjectif :", err)
    );
  }

  await interaction.reply(
    `✅ Nouvel objectif fixé : **${nombre} membres**\n📝 ${description}`
  );
}