import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { prisma } from "../prisma";

const ROLES_AUTORISES = ["OWNER", "ADMIN"];
const MOTS_PAR_PAGE = 20; // 4 lignes de 5 boutons + 1 ligne de navigation (limite Discord : 25 boutons)

export const data = new SlashCommandBuilder()
  .setName("unblacklist")
  .setDescription("Retirer des mots de la blacklist (OWNER / ADMIN)")
  .setDMPermission(false);

function aLeDroit(membre: GuildMember | null): boolean {
  if (!membre?.roles?.cache) return false;
  return membre.roles.cache.some((r) => ROLES_AUTORISES.includes(r.name.toUpperCase()));
}

const MESSAGE_REFUSE = "❌ Seuls les **OWNER** et **ADMIN** peuvent utiliser cette commande.";

// Construit le message (texte + boutons) d'une page de la liste
async function construirePage(guildId: string, page: number) {
  const total = await prisma.blacklistWord.count({ where: { guildId } });

  if (total === 0) {
    return { content: "✅ La blacklist est vide, aucun mot n'est interdit.", components: [] as ActionRowBuilder<ButtonBuilder>[] };
  }

  const nbPages = Math.ceil(total / MOTS_PAR_PAGE);
  const pageValide = Math.min(Math.max(page, 0), nbPages - 1);

  const mots = await prisma.blacklistWord.findMany({
    where: { guildId },
    orderBy: { word: "asc" },
    skip: pageValide * MOTS_PAR_PAGE,
    take: MOTS_PAR_PAGE,
  });

  const lignes: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < mots.length; i += 5) {
    const ligne = new ActionRowBuilder<ButtonBuilder>();
    for (const mot of mots.slice(i, i + 5)) {
      ligne.addComponents(
        new ButtonBuilder()
          .setCustomId(`unbl:del:${mot.id}:${pageValide}`)
          .setEmoji("❌")
          .setLabel(mot.word.length > 70 ? mot.word.slice(0, 67) + "…" : mot.word)
          .setStyle(ButtonStyle.Secondary)
      );
    }
    lignes.push(ligne);
  }

  if (nbPages > 1) {
    lignes.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`unbl:page:${pageValide - 1}`)
          .setEmoji("◀️")
          .setLabel("Précédent")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(pageValide === 0),
        new ButtonBuilder()
          .setCustomId("unbl:info")
          .setLabel(`Page ${pageValide + 1}/${nbPages}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(`unbl:page:${pageValide + 1}`)
          .setEmoji("▶️")
          .setLabel("Suivant")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(pageValide >= nbPages - 1)
      )
    );
  }

  return {
    content: `🚫 **Blacklist** : ${total} mot${total > 1 ? "s" : ""}\nClique sur ❌ à côté d'un mot pour l'autoriser à nouveau.`,
    components: lignes,
  };
}

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  if (!aLeDroit(interaction.member as GuildMember | null)) {
    await interaction.reply({ content: MESSAGE_REFUSE, flags: MessageFlags.Ephemeral });
    return;
  }

  const page = await construirePage(interaction.guild.id, 0);
  await interaction.reply({ ...page, flags: MessageFlags.Ephemeral });
}

// Boutons ❌ (retirer un mot) et ◀ ▶ (changer de page)
export async function gererBoutonUnblacklist(interaction: ButtonInteraction) {
  const guild = interaction.guild;
  if (!guild) return;

  if (!aLeDroit(interaction.member as GuildMember | null)) {
    await interaction.reply({ content: MESSAGE_REFUSE, flags: MessageFlags.Ephemeral });
    return;
  }

  const [, action, valeur, pageTexte] = interaction.customId.split(":");

  if (action === "page") {
    await interaction.update(await construirePage(guild.id, Number(valeur)));
    return;
  }

  if (action === "del") {
    // Le filtre sur guildId empêche de supprimer un mot d'un autre serveur
    await prisma.blacklistWord.deleteMany({ where: { id: Number(valeur), guildId: guild.id } });
    await interaction.update(await construirePage(guild.id, Number(pageTexte) || 0));
    return;
  }
}