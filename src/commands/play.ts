import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
  EmbedBuilder,
} from "discord.js";
import {
  joinVoiceChannel,
  entersState,
  VoiceConnectionStatus,
  getVoiceConnection,
} from "@discordjs/voice";
import play from "play-dl";
import { demarrerLecture } from "../music";

export const data = new SlashCommandBuilder()
  .setName("play")
  .setDescription("Jouer une musique ou une playlist YouTube/SoundCloud en boucle")
  .addStringOption((option) =>
    option.setName("url").setDescription("Le lien YouTube ou SoundCloud").setRequired(true)
  );

async function avecReessai<T>(fn: () => Promise<T>, tentatives = 3, delaiMs = 1000): Promise<T> {
  let derniereErreur: unknown;
  for (let i = 0; i < tentatives; i++) {
    try {
      return await fn();
    } catch (err) {
      derniereErreur = err;
      console.error(`⚠️ Tentative ${i + 1}/${tentatives} échouée :`, err);
      if (i < tentatives - 1) {
        await new Promise((resolve) => setTimeout(resolve, delaiMs));
      }
    }
  }
  throw derniereErreur;
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const url = interaction.options.getString("url", true);
  const membre = interaction.member as GuildMember;

  const salonVocal = membre.voice.channel;

  if (!salonVocal) {
    await interaction.reply({
      content: "❌ Tu dois être connecté à un salon vocal pour utiliser cette commande.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  let typeUrl: string;
  try {
    typeUrl = await avecReessai(() => play.validate(url));
  } catch (error) {
    console.error(error);
    await interaction.editReply("❌ Impossible d'analyser ce lien pour le moment, réessaie dans quelques secondes.");
    return;
  }

  let tracks: string[] = [];
  let titre = "Musique";

  try {
    if (typeUrl === "yt_playlist") {
      const playlist = await avecReessai(() => play.playlist_info(url, { incomplete: true }));
      const videos = await avecReessai(() => playlist.all_videos());
      tracks = videos.map((v) => v.url);
      titre = playlist.title || "Playlist YouTube";
    } else if (typeUrl === "yt_video") {
      const info = await avecReessai(() => play.video_info(url));
      tracks = [url];
      titre = info.video_details.title || "Vidéo YouTube";
    } else if (typeUrl === "so_track") {
      tracks = [url];
      const info = await avecReessai(() => play.soundcloud(url));
      titre = (info as any).name || "Musique SoundCloud";
    } else if (typeUrl === "so_playlist") {
      const playlist: any = await avecReessai(() => play.soundcloud(url));
      tracks = playlist.tracks.map((t: any) => t.url);
      titre = playlist.name || "Playlist SoundCloud";
    } else {
      await interaction.editReply("❌ Ce lien n'est pas reconnu (YouTube ou SoundCloud uniquement).");
      return;
    }
  } catch (error) {
    console.error(error);
    await interaction.editReply("❌ Impossible de récupérer cette musique/playlist après plusieurs tentatives. Réessaie dans un instant.");
    return;
  }

  if (tracks.length === 0) {
    await interaction.editReply("❌ Aucune piste trouvée pour ce lien.");
    return;
  }

  let connection = getVoiceConnection(salonVocal.guild.id);

  if (!connection || connection.state.status === VoiceConnectionStatus.Destroyed) {
    connection = joinVoiceChannel({
      channelId: salonVocal.id,
      guildId: salonVocal.guild.id,
      adapterCreator: salonVocal.guild.voiceAdapterCreator,
    });
  }

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 15000);
    console.log("✅ Connexion vocale prête (Ready)");
  } catch (err) {
    console.error('❌ La connexion vocale n\'est jamais devenue "Ready" :', err);
    await interaction.editReply("❌ Impossible de se connecter correctement au salon vocal.");
    return;
  }

  await demarrerLecture(salonVocal.guild.id, connection, tracks);

  const embed = new EmbedBuilder()
    .setColor(0x1db954)
    .setTitle("🎵 Lecture en cours")
    .setDescription(`**${titre}**\n${tracks.length} piste(s) — lecture en boucle`);

  await interaction.editReply({ embeds: [embed] });
}