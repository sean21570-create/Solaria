import {
  ActionRowBuilder,
  Attachment,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Guild,
  GuildMember,
  Message,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
  User,
} from "discord.js";
import * as fs from "fs";
import * as path from "path";
import { prisma } from "./prisma";

// Le salon est trouvé par son nom (il suffit qu'il contienne "find-a-match")
export const NOM_SALON_MATCH = "find-a-match";

// Rôles qui donnent accès au salon, en plus des rôles staff.
// Pour ajouter un rôle, ajoute simplement son nom dans cette liste.
export const ROLES_ACCES = ["Majeur", "MEMBRES"];
const ROLES_STAFF = ["OWNER", "ADMIN"];

const TAILLE_MAX_PHOTO = 8 * 1024 * 1024; // 8 Mo
const DUREE_FORMULAIRE_MS = 15 * 60 * 1000; // temps pour finir le formulaire
const TYPES_PHOTO: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

// Bannière facultative : mets une image ici pour l'afficher en grand sur le panneau
const CHEMIN_BANNIERE = path.join(process.cwd(), "assets", "find-a-match.png");

// ───────── Données temporaires en mémoire ─────────
interface PhotoEnAttente {
  url: string;
  ext: string;
  expire: number;
}
const photosEnAttente = new Map<string, PhotoEnAttente>();

interface DonneesCv {
  prenom: string;
  description: string;
  recherche: string;
  interets: string;
  region: string;
  greenflag: string;
  redflag: string;
  favoris: string;
  funfact: string;
  accroche: string;
  expire: number;
}
const formulaires = new Map<string, DonneesCv>();

export function trouverSalonMatch(guild: Guild): TextChannel | undefined {
  return guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name.toLowerCase().includes(NOM_SALON_MATCH)
  ) as TextChannel | undefined;
}

// ───────── Accès réservé aux membres avec un rôle autorisé (ou staff) ─────────
export function aAccesMatch(membre: GuildMember | null): boolean {
  if (!membre?.roles?.cache) return false;
  const autorises = [...ROLES_ACCES, ...ROLES_STAFF].map((n) => n.toUpperCase());
  return membre.roles.cache.some((r) => autorises.includes(r.name.toUpperCase()));
}

export const MESSAGE_ACCES_REFUSE =
  `🔞 Ce salon est réservé aux **majeurs (18 ans et +)**. Pour y accéder, il te faut un des rôles suivants : ${ROLES_ACCES.map((r) => `**${r}**`).join(", ")}. ` +
  `Contacte un OWNER ou un ADMIN pour le demander.`;

const MESSAGE_EXPIRE = "⌛ Ton formulaire a expiré. Clique à nouveau sur **Déposer mon CV** pour recommencer.";

// Vérifie la photo de /cv. Renvoie un message d'erreur, ou null si tout est bon.
export function preparerPhoto(userId: string, photo: Attachment | null): string | null {
  if (!photo) {
    photosEnAttente.delete(userId);
    return null;
  }

  const type = (photo.contentType ?? "").split(";")[0].toLowerCase();
  const ext = TYPES_PHOTO[type];
  if (!ext) return "❌ La photo doit être au format PNG, JPG, WEBP ou GIF.";
  if (photo.size > TAILLE_MAX_PHOTO) return "❌ La photo est trop lourde (8 Mo maximum).";

  photosEnAttente.set(userId, { url: photo.url, ext, expire: Date.now() + DUREE_FORMULAIRE_MS });
  return null;
}

export function oublierPhoto(userId: string) {
  photosEnAttente.delete(userId);
}

// ───────── Formulaires (2 étapes car Discord limite à 5 champs par formulaire) ─────────
function champ(
  id: string,
  label: string,
  style: TextInputStyle,
  max: number,
  requis: boolean,
  placeholder?: string
) {
  const input = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setMaxLength(max).setRequired(requis);
  if (placeholder) input.setPlaceholder(placeholder);
  return new ActionRowBuilder<TextInputBuilder>().addComponents(input);
}

// Étape 1 : l'essentiel
export function creerModalCv() {
  return new ModalBuilder()
    .setCustomId("match_cv")
    .setTitle("Ton CV 💋 (étape 1/2)")
    .addComponents(
      champ("prenom", "Prénom ou pseudo", TextInputStyle.Short, 30, true, "Ex : Léa"),
      champ("description", "Qui es-tu ?", TextInputStyle.Paragraph, 800, true, "Présente-toi : ton caractère, ton humour, ce qui te définit..."),
      champ("recherche", "Ce que tu recherches (optionnel)", TextInputStyle.Paragraph, 300, false, "Ex : une personne cool pour discuter, relation sérieuse..."),
      champ("interets", "Centres d'intérêt (optionnel)", TextInputStyle.Short, 150, false, "Jeux, musique, sport..."),
      champ("region", "Ville / région (optionnel)", TextInputStyle.Short, 60, false, "Ex : Paris, Sud de la France...")
    );
}

// Étape 2 : pour aller plus loin (facultative)
function creerModalEtape2() {
  return new ModalBuilder()
    .setCustomId("match_cv2")
    .setTitle("Ton CV 💋 (étape 2/2)")
    .addComponents(
      champ("greenflag", "Ton green flag 💚 (optionnel)", TextInputStyle.Short, 100, false, "Ta plus grande qualité"),
      champ("redflag", "Ton red flag 🚩 (optionnel)", TextInputStyle.Short, 100, false, "Ton plus gros défaut"),
      champ("favoris", "Jeux, séries, musique préférés", TextInputStyle.Short, 150, false, "Ex : Valorant, One Piece, rap FR..."),
      champ("funfact", "Un fun fact sur toi (optionnel)", TextInputStyle.Short, 150, false, "Un truc que personne ne devine"),
      champ("accroche", "Phrase d'accroche (optionnel)", TextInputStyle.Short, 100, false, "Ce qui donne envie de t'écrire")
    );
}

function boutonsEtape1() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("match_step2")
      .setLabel("Étape 2 (facultative)")
      .setEmoji("📝")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("match_publish")
      .setLabel("Publier maintenant")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success)
  );
}

function boutons(profileId: number, userId: string, likes: number) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`match_like:${profileId}`)
      .setLabel(likes > 0 ? `Intéressé(e) · ${likes}` : "Intéressé(e)")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setLabel("MP")
      .setEmoji("💬")
      .setStyle(ButtonStyle.Link)
      .setURL(`https://discord.com/users/${userId}`),
    new ButtonBuilder()
      .setCustomId(`match_del:${profileId}`)
      .setLabel("Supprimer")
      .setEmoji("🗑️")
      .setStyle(ButtonStyle.Danger)
  );
}

// ───────── Panneau fixe "Déposer son CV" ─────────
function boutonPanneau() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("match_open")
      .setLabel("Déposer mon CV")
      .setEmoji("💋")
      .setStyle(ButtonStyle.Primary)
  );
}

// ───────── Salon réservé aux CV : personne ne peut écrire, sauf le bot ─────────
async function verrouillerSalon(salon: TextChannel): Promise<boolean> {
  try {
    const botMember = salon.guild.members.me;

    // 1. Le bot garde tous les droits dont il a besoin (en premier, pour ne jamais se bloquer lui-même)
    if (botMember) {
      await salon.permissionOverwrites.edit(botMember, {
        ViewChannel: true,
        ReadMessageHistory: true,
        SendMessages: true,
        EmbedLinks: true,
        AttachFiles: true,
        ManageMessages: true,
      });
    }

    // 2. @everyone ne peut plus écrire ni créer de fils
    await salon.permissionOverwrites.edit(salon.guild.roles.everyone, {
      SendMessages: false,
      SendMessagesInThreads: false,
      CreatePublicThreads: false,
      CreatePrivateThreads: false,
    });

    // 3. Les rôles qui avaient un droit d'écriture explicite sur ce salon le perdent aussi
    //    (sinon ils passeraient au-dessus du refus de @everyone)
    for (const regle of [...salon.permissionOverwrites.cache.values()]) {
      if (regle.id === salon.guild.roles.everyone.id) continue;
      if (botMember && regle.id === botMember.id) continue;

      if (regle.allow.has("SendMessages") || regle.allow.has("SendMessagesInThreads")) {
        await salon.permissionOverwrites.edit(regle.id, {
          SendMessages: false,
          SendMessagesInThreads: false,
        });
      }
    }

    return true;
  } catch (err) {
    console.error("⚠️ Impossible de verrouiller le salon find-a-match :", err);
    return false;
  }
}

// Filet de sécurité : tout message qui n'est pas celui du bot est supprimé aussitôt
// (couvre les administrateurs, qui contournent les permissions de salon)
let gardeActive = false;

function demarrerGardeSalon(client: Client) {
  if (gardeActive) return;
  gardeActive = true;

  client.on("messageCreate", async (message) => {
    try {
      if (!message.guild) return;
      if (message.author.id === client.user?.id) return;

      const salon = trouverSalonMatch(message.guild);
      if (!salon || message.channelId !== salon.id) return;

      await message.delete();
    } catch (err) {
      console.error("⚠️ Impossible de supprimer un message dans find-a-match (le bot a-t-il « Gérer les messages » ?) :", err);
    }
  });

  console.log("🛡️ Garde du salon find-a-match active (seuls les CV sont autorisés)");
}

function estPanneau(message: Message): boolean {
  return message.components.some((row: any) => row.components?.some((c: any) => c.customId === "match_open"));
}

// Cherche les panneaux du bot dans les ~500 derniers messages (null si le salon est illisible)
async function chercherPanneaux(salon: TextChannel, client: Client): Promise<Message[] | null> {
  const trouves: Message[] = [];
  let avant: string | undefined;

  for (let page = 0; page < 5; page++) {
    const lot = await salon.messages.fetch({ limit: 100, before: avant }).catch(() => null);
    if (!lot) return page === 0 ? null : trouves;
    if (lot.size === 0) break;

    for (const message of lot.values()) {
      if (message.author.id === client.user?.id && estPanneau(message)) trouves.push(message);
    }

    avant = lot.last()?.id;
    if (lot.size < 100) break;
  }
  return trouves;
}

export async function publierPanneau(
  salon: TextChannel,
  client: Client,
  verrouiller = true
): Promise<{ lien: string; verrouille: boolean; banniere: boolean }> {
  const verrouille = verrouiller ? await verrouillerSalon(salon) : true;

  const embed = new EmbedBuilder()
    .setColor(0xff6fae)
    .setDescription(
      [
        "# 💋 DÉPOSE TON CV",
        "",
        "Présente-toi ici et laisse les autres venir à toi.",
        "",
        "**Comment ça marche ?**",
        "1️⃣ Clique sur le bouton **Déposer mon CV** juste en dessous",
        "2️⃣ Remplis le template en 2 étapes (la 2ème est facultative) : présentation, ce que tu recherches, green flag, red flag...",
        "3️⃣ Ton CV est publié dans ce salon",
        "4️⃣ Les personnes intéressées cliquent sur **✅ Intéressé(e)** ou sur **💬 MP**",
        "",
        "📸 **Tu veux une photo ?** Tape `/cv` et joins ton image dans l'option *photo*.",
        "💞 Si vous cliquez ✅ tous les deux, c'est un **match** et le bot vous prévient en MP.",
        "",
        "✍️ Ce salon est réservé aux CV : tout autre message est supprimé automatiquement.",
        "🤝 Respect obligatoire : pas d'insultes, de harcèlement ni de contenu explicite. Les OWNER et ADMIN peuvent supprimer n'importe quel CV.",
      ].join("\n")
    )
    .setFooter({ text: "find-a-match 💋 · 1 CV par personne, refaire le formulaire remplace l'ancien" });

  const banniere = fs.existsSync(CHEMIN_BANNIERE);
  const files: AttachmentBuilder[] = [];
  if (banniere) {
    files.push(new AttachmentBuilder(CHEMIN_BANNIERE, { name: "find-a-match.png" }));
    embed.setImage("attachment://find-a-match.png");
  }

  // On récupère les anciens panneaux avant d'envoyer le nouveau, puis on les supprime
  const anciens = (await chercherPanneaux(salon, client)) ?? [];

  const message = await salon.send({
    embeds: [embed],
    files,
    components: [boutonPanneau()],
  });

  for (const ancien of anciens) await ancien.delete().catch(() => null);

  return { lien: message.url, verrouille, banniere };
}

// ───────── Panneau automatique ─────────
const verrous = new Set<string>();

// Trouve le salon tout seul, le verrouille, et poste le panneau s'il n'y en a pas déjà un
export async function assurerPanneau(guild: Guild, client: Client) {
  // La garde se met en route dès le premier appel (au démarrage du bot)
  demarrerGardeSalon(client);

  if (verrous.has(guild.id)) return;
  verrous.add(guild.id);

  try {
    const salon = trouverSalonMatch(guild);
    if (!salon) {
      console.log(`ℹ️ Pas de salon "${NOM_SALON_MATCH}" sur "${guild.name}", panneau non posté.`);
      return;
    }

    // Le verrouillage est réappliqué à chaque démarrage, même si le panneau existe déjà
    const verrouille = await verrouillerSalon(salon);
    if (verrouille) console.log(`🔒 Salon find-a-match verrouillé sur "${guild.name}" (personne ne peut écrire, sauf le bot).`);

    const panneaux = await chercherPanneaux(salon, client);
    if (!panneaux) {
      console.error(`⚠️ Impossible de lire <#${salon.id}> sur "${guild.name}" : le bot doit voir le salon et lire l'historique.`);
      return;
    }

    if (panneaux.length > 0) {
      console.log(`ℹ️ Panneau find-a-match déjà présent sur "${guild.name}".`);
      return;
    }

    await publierPanneau(salon, client, false);
    console.log(`✅ Panneau find-a-match posté automatiquement sur "${guild.name}".`);
  } catch (err) {
    console.error(`❌ Impossible de poster le panneau find-a-match sur "${guild.name}" :`, err);
  } finally {
    verrous.delete(guild.id);
  }
}

// Remet le panneau tout en bas après un nouveau CV, pour que le bouton reste visible
async function remonterPanneau(salon: TextChannel, client: Client) {
  if (verrous.has(salon.guild.id)) return;
  verrous.add(salon.guild.id);
  try {
    await publierPanneau(salon, client, false);
  } catch (err) {
    console.error("⚠️ Impossible de remonter le panneau find-a-match :", err);
  } finally {
    verrous.delete(salon.guild.id);
  }
}

// ───────── Clic sur "Déposer mon CV" : ouvre l'étape 1 ─────────
export async function ouvrirFormulaire(interaction: ButtonInteraction) {
  if (!aAccesMatch(interaction.member as GuildMember | null)) {
    await interaction.reply({ content: MESSAGE_ACCES_REFUSE, flags: MessageFlags.Ephemeral });
    return;
  }

  oublierPhoto(interaction.user.id);
  formulaires.delete(interaction.user.id);
  await interaction.showModal(creerModalCv());
}

// ───────── Envoi de l'étape 1 ─────────
export async function gererModalCv(interaction: ModalSubmitInteraction) {
  if (!interaction.guild) return;

  if (!aAccesMatch(interaction.member as GuildMember | null)) {
    photosEnAttente.delete(interaction.user.id);
    await interaction.reply({ content: MESSAGE_ACCES_REFUSE, flags: MessageFlags.Ephemeral });
    return;
  }

  const lire = (id: string) => interaction.fields.getTextInputValue(id).trim();

  formulaires.set(interaction.user.id, {
    prenom: lire("prenom"),
    description: lire("description"),
    recherche: lire("recherche"),
    interets: lire("interets"),
    region: lire("region"),
    greenflag: "",
    redflag: "",
    favoris: "",
    funfact: "",
    accroche: "",
    expire: Date.now() + DUREE_FORMULAIRE_MS,
  });

  await interaction.reply({
    content:
      "✅ **Étape 1 terminée !**\nTu peux publier ton CV tout de suite, ou le compléter avec l'étape 2 (green flag, red flag, goûts, fun fact...) pour qu'il soit plus attractif.",
    components: [boutonsEtape1()],
    flags: MessageFlags.Ephemeral,
  });
}

function recupererFormulaire(userId: string): DonneesCv | null {
  const donnees = formulaires.get(userId);
  if (!donnees || donnees.expire < Date.now()) {
    formulaires.delete(userId);
    return null;
  }
  return donnees;
}

// ───────── Bouton "Étape 2" ─────────
export async function ouvrirEtape2(interaction: ButtonInteraction) {
  if (!aAccesMatch(interaction.member as GuildMember | null)) {
    await interaction.reply({ content: MESSAGE_ACCES_REFUSE, flags: MessageFlags.Ephemeral });
    return;
  }
  if (!recupererFormulaire(interaction.user.id)) {
    await interaction.reply({ content: MESSAGE_EXPIRE, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.showModal(creerModalEtape2());
}

// ───────── Bouton "Publier maintenant" ─────────
export async function publierSansEtape2(interaction: ButtonInteraction) {
  if (!interaction.guild) return;

  if (!aAccesMatch(interaction.member as GuildMember | null)) {
    await interaction.reply({ content: MESSAGE_ACCES_REFUSE, flags: MessageFlags.Ephemeral });
    return;
  }

  const donnees = recupererFormulaire(interaction.user.id);
  if (!donnees) {
    await interaction.reply({ content: MESSAGE_EXPIRE, flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferUpdate();
  await publierCv(interaction.guild, interaction.user, donnees, (texte) =>
    interaction.editReply({ content: texte, components: [] })
  );
}

// ───────── Envoi de l'étape 2 : publication ─────────
export async function gererModalEtape2(interaction: ModalSubmitInteraction) {
  if (!interaction.guild) return;

  if (!aAccesMatch(interaction.member as GuildMember | null)) {
    await interaction.reply({ content: MESSAGE_ACCES_REFUSE, flags: MessageFlags.Ephemeral });
    return;
  }

  const donnees = recupererFormulaire(interaction.user.id);
  if (!donnees) {
    await interaction.reply({ content: MESSAGE_EXPIRE, flags: MessageFlags.Ephemeral });
    return;
  }

  const lire = (id: string) => interaction.fields.getTextInputValue(id).trim();
  donnees.greenflag = lire("greenflag");
  donnees.redflag = lire("redflag");
  donnees.favoris = lire("favoris");
  donnees.funfact = lire("funfact");
  donnees.accroche = lire("accroche");

  if (interaction.isFromMessage()) await interaction.deferUpdate();
  else await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  await publierCv(interaction.guild, interaction.user, donnees, (texte) =>
    interaction.editReply({ content: texte, components: [] })
  );
}

async function supprimerMessageCv(guild: Guild, profil: { channelId: string; messageId: string | null }) {
  if (!profil.messageId) return;
  const salon = await guild.channels.fetch(profil.channelId).catch(() => null);
  if (!salon || !salon.isTextBased()) return;
  const message = await salon.messages.fetch(profil.messageId).catch(() => null);
  await message?.delete().catch(() => null);
}

function construireEmbed(user: User, d: DonneesCv, nomPhoto: string | null) {
  const embed = new EmbedBuilder()
    .setColor(0xff6fae)
    .setTitle(`💋 ${d.prenom}`)
    .setDescription(d.description)
    .setFooter({ text: `CV de ${user.username}` })
    .setTimestamp();

  if (d.accroche) embed.addFields({ name: "💬 Accroche", value: d.accroche });
  if (d.recherche) embed.addFields({ name: "🔍 Recherche", value: d.recherche });
  if (d.region) embed.addFields({ name: "📍 Ville / région", value: d.region, inline: true });
  if (d.interets) embed.addFields({ name: "✨ Centres d'intérêt", value: d.interets, inline: true });
  if (d.favoris) embed.addFields({ name: "🎮 Goûts", value: d.favoris });
  if (d.greenflag) embed.addFields({ name: "💚 Green flag", value: d.greenflag, inline: true });
  if (d.redflag) embed.addFields({ name: "🚩 Red flag", value: d.redflag, inline: true });
  if (d.funfact) embed.addFields({ name: "🎲 Fun fact", value: d.funfact });

  if (nomPhoto) embed.setImage(`attachment://${nomPhoto}`);
  else embed.setThumbnail(user.displayAvatarURL());

  return embed;
}

// ───────── Publication du CV dans le salon ─────────
async function publierCv(
  guild: Guild,
  user: User,
  donnees: DonneesCv,
  repondre: (texte: string) => Promise<unknown>
) {
  const salon = trouverSalonMatch(guild);
  if (!salon) {
    await repondre(`❌ Salon introuvable : il doit y avoir un salon texte dont le nom contient "${NOM_SALON_MATCH}".`);
    return;
  }

  formulaires.delete(user.id);

  // Récupération de la photo (republiée par le bot pour qu'elle ne soit pas perdue)
  const enAttente = photosEnAttente.get(user.id);
  photosEnAttente.delete(user.id);

  let fichier: AttachmentBuilder | undefined;
  let nomPhoto: string | null = null;
  let photoEchec = false;
  if (enAttente && enAttente.expire > Date.now()) {
    try {
      const reponse = await fetch(enAttente.url);
      if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
      const buffer = Buffer.from(await reponse.arrayBuffer());
      if (buffer.length > TAILLE_MAX_PHOTO) throw new Error("photo trop lourde");
      nomPhoto = `photo.${enAttente.ext}`;
      fichier = new AttachmentBuilder(buffer, { name: nomPhoto });
    } catch (err) {
      console.error("⚠️ Impossible de récupérer la photo du CV :", err);
      photoEchec = true;
    }
  }

  const embed = construireEmbed(user, donnees, fichier ? nomPhoto : null);

  // Un seul CV par personne : le nouveau remplace l'ancien
  const ancien = await prisma.matchProfile.findUnique({
    where: { guildId_userId: { guildId: guild.id, userId: user.id } },
  });
  if (ancien) {
    await supprimerMessageCv(guild, ancien);
    await prisma.matchProfile.delete({ where: { id: ancien.id } });
  }

  const profil = await prisma.matchProfile.create({
    data: { guildId: guild.id, userId: user.id, channelId: salon.id },
  });

  try {
    const message = await salon.send({
      content: `💌 CV de <@${user.id}>`,
      embeds: [embed],
      files: fichier ? [fichier] : [],
      components: [boutons(profil.id, user.id, 0)],
      allowedMentions: { parse: [] },
    });
    await prisma.matchProfile.update({ where: { id: profil.id }, data: { messageId: message.id } });

    await repondre(
      `✅ Ton CV est publié dans <#${salon.id}> : ${message.url}` +
        (photoEchec ? "\n⚠️ Ta photo n'a pas pu être récupérée, refais `/cv` avec la photo pour la rajouter." : "") +
        (!enAttente ? "\n📸 Tu veux ajouter une photo ? Tape `/cv` et joins ton image dans l'option *photo*." : "")
    );

    // Le panneau repasse tout en bas, sous le nouveau CV
    await remonterPanneau(salon, guild.client);
  } catch (err) {
    console.error("❌ Impossible de publier le CV :", err);
    await prisma.matchProfile.delete({ where: { id: profil.id } }).catch(() => null);
    await repondre(
      "❌ Impossible de publier ton CV. Le bot doit pouvoir voir le salon, y écrire, intégrer des liens et joindre des fichiers."
    );
  }
}

// ───────── Bouton ✅ Intéressé(e) ─────────
export async function gererLike(interaction: ButtonInteraction) {
  const guild = interaction.guild;
  const id = Number(interaction.customId.split(":")[1]);
  if (!guild || !Number.isInteger(id)) return;

  if (!aAccesMatch(interaction.member as GuildMember | null)) {
    await interaction.reply({ content: MESSAGE_ACCES_REFUSE, flags: MessageFlags.Ephemeral });
    return;
  }

  const profil = await prisma.matchProfile.findUnique({ where: { id } });
  if (!profil) {
    await interaction.reply({ content: "❌ Ce CV n'existe plus.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (profil.userId === interaction.user.id) {
    await interaction.reply({ content: "😅 Tu ne peux pas être intéressé(e) par ton propre CV.", flags: MessageFlags.Ephemeral });
    return;
  }

  const existant = await prisma.matchLike.findUnique({
    where: { profileId_userId: { profileId: id, userId: interaction.user.id } },
  });

  let nouveau = false;
  if (existant) {
    await prisma.matchLike.delete({ where: { id: existant.id } }).catch(() => null);
  } else {
    await prisma.matchLike.create({ data: { profileId: id, userId: interaction.user.id } }).catch(() => null);
    nouveau = true;
  }

  const likes = await prisma.matchLike.count({ where: { profileId: id } });
  await interaction.update({ components: [boutons(id, profil.userId, likes)] });

  if (!nouveau) {
    await interaction.followUp({ content: "↩️ Tu n'es plus marqué(e) comme intéressé(e).", flags: MessageFlags.Ephemeral });
    return;
  }

  // Anti-spam : la notification n'est envoyée qu'UNE SEULE fois par (toi -> cette personne),
  // même si tu retires puis remets ✅, ou si elle refait son CV.
  let premiereNotif = false;
  try {
    await prisma.matchNotif.create({
      data: { guildId: guild.id, targetId: profil.userId, likerId: interaction.user.id },
    });
    premiereNotif = true;
  } catch (err) {
    if ((err as any)?.code !== "P2002") console.error("⚠️ Erreur d'enregistrement de la notification find-a-match :", err);
  }

  // Match mutuel : la personne du CV avait-elle déjà aimé le CV de celui/celle qui clique ?
  const reciproque = await prisma.matchLike.findFirst({
    where: { userId: profil.userId, profile: { guildId: profil.guildId, userId: interaction.user.id } },
  });

  if (!premiereNotif) {
    await interaction.followUp({
      content: reciproque
        ? `💞 **C'est un match avec <@${profil.userId}> !** Vous aviez déjà été prévenus, pas de nouveau message.\nÉcris-lui : https://discord.com/users/${profil.userId}`
        : "✅ C'est noté. La personne a déjà été prévenue de ton intérêt, aucun nouveau message n'est envoyé.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const lienCv = profil.messageId
    ? `https://discord.com/channels/${profil.guildId}/${profil.channelId}/${profil.messageId}`
    : "";
  const auteur = await interaction.client.users.fetch(profil.userId).catch(() => null);

  if (reciproque) {
    await auteur
      ?.send(
        `💞 **C'est un match !** <@${interaction.user.id}> est intéressé(e) par ton CV sur **${guild.name}**, et tu avais déjà aimé le sien.\nÉcris-lui : https://discord.com/users/${interaction.user.id}`
      )
      .catch(() => null);
    await interaction.user
      .send(
        `💞 **C'est un match !** <@${profil.userId}> avait déjà aimé ton CV sur **${guild.name}**.\nÉcris-lui : https://discord.com/users/${profil.userId}`
      )
      .catch(() => null);
    await interaction.followUp({
      content: `💞 **C'est un match avec <@${profil.userId}> !** Il/elle avait aussi aimé ton CV.\nÉcris-lui : https://discord.com/users/${profil.userId}`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await auteur
    ?.send(
      `💘 <@${interaction.user.id}> est intéressé(e) par ton CV sur **${guild.name}** !\nSon profil : https://discord.com/users/${interaction.user.id}${lienCv ? `\nTon CV : ${lienCv}` : ""}`
    )
    .catch(() => null);

  await interaction.followUp({
    content: "✅ C'est noté, la personne est prévenue en MP. Tu peux aussi lui écrire avec le bouton **MP** 💬",
    flags: MessageFlags.Ephemeral,
  });
}

// ───────── Bouton 🗑️ Supprimer ─────────
export async function gererSuppression(interaction: ButtonInteraction) {
  const id = Number(interaction.customId.split(":")[1]);
  if (!interaction.guild || !Number.isInteger(id)) return;

  const profil = await prisma.matchProfile.findUnique({ where: { id } });
  if (!profil) {
    await interaction.reply({ content: "❌ Ce CV est introuvable.", flags: MessageFlags.Ephemeral });
    return;
  }

  const membre = interaction.member as GuildMember | null;
  const estStaff = membre?.roles?.cache?.some((r) => ROLES_STAFF.includes(r.name.toUpperCase())) ?? false;

  if (profil.userId !== interaction.user.id && !estStaff) {
    await interaction.reply({ content: "❌ Tu ne peux supprimer que ton propre CV.", flags: MessageFlags.Ephemeral });
    return;
  }

  await prisma.matchProfile.delete({ where: { id } });
  await interaction.reply({ content: "🗑️ CV supprimé.", flags: MessageFlags.Ephemeral });
  await interaction.message.delete().catch(() => null);
}