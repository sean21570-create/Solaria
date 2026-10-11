import { Guild, ChannelType, VoiceChannel, StageChannel } from "discord.js";
import { prisma } from "./prisma";

const PREFIXE_SALON_COMPTEUR = "Members:";
const DELAI_REGROUPEMENT_MS = 3000; // regroupe plusieurs arrivées/départs rapprochés

interface EtatGuild {
  timeoutId?: NodeJS.Timeout;
  enCours: boolean;
  relancer: boolean;
}

const etatParGuild = new Map<string, EtatGuild>();

function obtenirEtat(guildId: string): EtatGuild {
  let etat = etatParGuild.get(guildId);
  if (!etat) {
    etat = { enCours: false, relancer: false };
    etatParGuild.set(guildId, etat);
  }
  return etat;
}

function estVocal(c: any): c is VoiceChannel | StageChannel {
  return c && (c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice);
}

async function appliquerMiseAJour(guild: Guild) {
  const etat = obtenirEtat(guild.id);

  // Évite deux recréations en parallèle (sinon doublons de salons)
  if (etat.enCours) {
    etat.relancer = true;
    return;
  }
  etat.enCours = true;

  try {
    const config = await prisma.guild.upsert({
      where: { id: guild.id },
      update: {},
      create: { id: guild.id, name: guild.name },
    });

    let salon: any = config.memberCountChannelId
      ? guild.channels.cache.get(config.memberCountChannelId)
      : undefined;

    if (!salon) {
      salon = guild.channels.cache.find(
        (c) => estVocal(c) && c.name.toLowerCase().startsWith("members")
      );
    }

    if (!estVocal(salon)) {
      console.error(`⚠️ Aucun salon vocal "Members" trouvé sur "${guild.name}".`);
      return;
    }

    const nouveauNom = `${PREFIXE_SALON_COMPTEUR} ${guild.memberCount}`;

    if (salon.name === nouveauNom) {
      console.log(`ℹ️ Compteur déjà à jour sur "${guild.name}" (${nouveauNom}).`);
      return;
    }

    const position = salon.rawPosition;

    // 1. On crée le nouveau salon (copie des permissions, catégorie, etc.)
    const nouveauSalon = await salon.clone({
      name: nouveauNom,
      position,
      reason: "Mise à jour du compteur de membres",
    });

    // 2. On sauvegarde le nouvel ID
    await prisma.guild.update({
      where: { id: guild.id },
      data: { memberCountChannelId: nouveauSalon.id },
    });

    // 3. On supprime l'ancien
    await salon.delete("Mise à jour du compteur de membres").catch((err: unknown) => {
      console.error("⚠️ Impossible de supprimer l'ancien salon compteur :", err);
    });

    // 4. On remet à la bonne position au cas où
    await nouveauSalon.setPosition(position).catch(() => {});

    console.log(`✅ Salon compteur recréé sur "${guild.name}" : ${nouveauNom}`);
  } catch (err) {
    console.error(`❌ Échec de la recréation du salon compteur sur "${guild.name}" :`, err);
  } finally {
    etat.enCours = false;
    if (etat.relancer) {
      etat.relancer = false;
      appliquerMiseAJour(guild).catch(console.error);
    }
  }
}

export async function actualiserSalonCompteur(guild: Guild) {
  const etat = obtenirEtat(guild.id);

  if (etat.timeoutId) clearTimeout(etat.timeoutId);

  etat.timeoutId = setTimeout(() => {
    etat.timeoutId = undefined;
    appliquerMiseAJour(guild).catch((err) =>
      console.error("⚠️ Erreur mise à jour du compteur de membres :", err)
    );
  }, DELAI_REGROUPEMENT_MS);
}

function DELAI_REGROUEMENT_MS_FIX() {
  return DELAI_REGROUPEMENT_MS;
}