import { GuildMember, PartialGuildMember, ChannelType } from "discord.js";

const SALON_BOOST = "👑・boost";
const NOM_ROLE_BOOSTER = "Booster";

export async function handleGuildMemberUpdate(
  oldMember: GuildMember | PartialGuildMember,
  newMember: GuildMember
) {
  // On détecte un NOUVEAU boost : avant il n'y en avait pas, maintenant oui
  const vientDeBooster = !oldMember.premiumSince && newMember.premiumSince;

  if (!vientDeBooster) return;

  // Attribution du rôle Booster
  const roleBooster = newMember.guild.roles.cache.find(
    (role) => role.name === NOM_ROLE_BOOSTER
  );

  if (roleBooster) {
    await newMember.roles.add(roleBooster).catch((err) => {
      console.error("⚠️ Impossible d'attribuer le rôle Booster :", err);
    });
  } else {
    console.error(`⚠️ Rôle "${NOM_ROLE_BOOSTER}" introuvable sur le serveur.`);
  }

  // Annonce dans le salon boost
  const salon = newMember.guild.channels.cache.find(
    (channel) => channel.type === ChannelType.GuildText && channel.name === SALON_BOOST
  );

  if (!salon || salon.type !== ChannelType.GuildText) {
    console.error(`⚠️ Salon "${SALON_BOOST}" introuvable.`);
    return;
  }

  await salon
    .send(`# 🎉 MERCI ${newMember} POUR LE BOOST ! 💎`)
    .catch((err) => console.error("⚠️ Impossible d'envoyer le message de boost :", err));
}