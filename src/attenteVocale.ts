import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
} from "discord.js";

// Le salon est trouvé si son nom contient ce texte (emojis et décoration ignorés)
const NOM_SALON_ATTENTE = "attente tp office";
const NOM_ROLE_OWNER = "OWNER";
const COOLDOWN_MS = 2 * 60 * 1000; // une alerte max toutes les 2 minutes par personne

const derniereAlerte = new Map<string, number>();

function normaliser(texte: string): string {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function estSalonAttente(channel: { type: ChannelType; name: string } | null | undefined): boolean {
  if (!channel) return false;
  if (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice) return false;
  return normaliser(channel.name).includes(NOM_SALON_ATTENTE);
}

export function demarrerAlerteAttente(client: Client) {
  client.on("voiceStateUpdate", async (ancien, nouveau) => {
    try {
      const membre = nouveau.member;
      const salon = nouveau.channel;
      const guild = nouveau.guild;

      if (!membre || membre.user.bot) return;
      if (!salon || !estSalonAttente(salon)) return;
      if (ancien.channelId === nouveau.channelId) return; // simple mute/démute, pas une arrivée

      // Un OWNER qui rejoint le salon n'a pas besoin d'être alerté
      if (membre.roles.cache.some((r) => r.name.toUpperCase() === NOM_ROLE_OWNER)) return;

      // Anti-spam : pas de nouvelle alerte pour la même personne avant 2 minutes
      const cle = `${guild.id}:${membre.id}`;
      const maintenant = Date.now();
      if (maintenant - (derniereAlerte.get(cle) ?? 0) < COOLDOWN_MS) return;
      derniereAlerte.set(cle, maintenant);

      // Liste à jour des membres pour trouver tous les OWNER
      await guild.members.fetch().catch(() => null);
      const owners = guild.members.cache.filter(
        (m) =>
          !m.user.bot &&
          m.id !== membre.id &&
          m.roles.cache.some((r) => r.name.toUpperCase() === NOM_ROLE_OWNER) &&
          m.voice.channelId !== salon.id // déjà dans le salon : il voit la personne
      );

      if (owners.size === 0) return;

      const embed = new EmbedBuilder()
        .setColor(0xfaa61a)
        .setTitle("⏳ Quelqu'un attend d'être déplacé")
        .setDescription(`<@${membre.id}> (**${membre.displayName}**) vient de rejoindre <#${salon.id}> sur **${guild.name}**.`)
        .setThumbnail(membre.user.displayAvatarURL())
        .setTimestamp();

      const bouton = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel("Rejoindre le vocal")
          .setEmoji("🎙️")
          .setStyle(ButtonStyle.Link)
          .setURL(`https://discord.com/channels/${guild.id}/${salon.id}`)
      );

      let envoyes = 0;
      for (const owner of owners.values()) {
        const ok = await owner
          .send({ embeds: [embed], components: [bouton] })
          .then(() => true)
          .catch(() => false);
        if (ok) envoyes++;
      }

      console.log(`⏳ ${membre.user.tag} attend dans "${salon.name}" : ${envoyes}/${owners.size} OWNER prévenu(s).`);
    } catch (err) {
      console.error("⚠️ Erreur alerte salon d'attente :", err);
    }
  });

  console.log("⏳ Alerte du salon d'attente vocal active");
}