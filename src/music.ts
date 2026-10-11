import {
  AudioPlayer,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnection,
  createAudioPlayer,
  createAudioResource,
} from "@discordjs/voice";
import { ChildProcess, spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";
import ytdlp from "yt-dlp-exec";

interface GuildMusicState {
  connection: VoiceConnection;
  player: AudioPlayer;
  tracks: string[];
  currentIndex: number;
  ytdlpProcess?: ChildProcess;
  ffmpegProcess?: ChildProcess;
  playToken: number;
}

const musicStates = new Map<string, GuildMusicState>();

export function getMusicState(guildId: string) {
  return musicStates.get(guildId);
}

function tuerProcessusAudio(state: GuildMusicState) {
  if (state.ytdlpProcess && !state.ytdlpProcess.killed) {
    state.ytdlpProcess.kill("SIGKILL");
  }
  if (state.ffmpegProcess && !state.ffmpegProcess.killed) {
    state.ffmpegProcess.kill("SIGKILL");
  }
  state.ytdlpProcess = undefined;
  state.ffmpegProcess = undefined;
}

async function jouerPiste(guildId: string) {
  const state = musicStates.get(guildId);
  if (!state) return;

  // On tue tout processus précédent avant d'en lancer un nouveau
  tuerProcessusAudio(state);

  // Jeton unique pour cet appel : si un autre jouerPiste démarre entre-temps,
  // celui-ci saura qu'il est périmé et ne touchera pas au state.
  const monToken = ++state.playToken;

  const url = state.tracks[state.currentIndex];
  console.log("🔎 Lancement du flux (yt-dlp → ffmpeg) pour :", url);

  const ytdlpProcess = ytdlp.exec(
    url,
    {
      output: "-",
      format: "bestaudio",
      quiet: true,
      noWarnings: true,
      noCheckCertificates: true,
      preferFreeFormats: true,
      noPlaylist: true,
    },
    { stdio: ["ignore", "pipe", "pipe"] }
  );

  const ffmpegProcess = spawn(ffmpegPath as string, [
    "-analyzeduration", "0",
    "-loglevel", "error",
    "-i", "pipe:0",
    "-f", "s16le",
    "-ar", "48000",
    "-ac", "2",
    "pipe:1",
  ]);

  // Vérifie qu'on est toujours le lecteur "actif" avant d'enregistrer les processus
  if (musicStates.get(guildId) !== state || state.playToken !== monToken) {
    ytdlpProcess.kill("SIGKILL");
    ffmpegProcess.kill("SIGKILL");
    return;
  }

  state.ytdlpProcess = ytdlpProcess;
  state.ffmpegProcess = ffmpegProcess;

  // Gestion d'erreurs SANS laisser planter le process Node
  ytdlpProcess.stdout?.on("error", (err: any) => {
    if (err.code !== "EPIPE") console.error("⚠️ yt-dlp stdout error :", err);
  });
  ytdlpProcess.stderr?.on("data", (data) => {
    console.error("⚠️ yt-dlp :", data.toString());
  });
  ytdlpProcess.on("error", (err) => {
    console.error("❌ Erreur au lancement de yt-dlp :", err);
  });

  ffmpegProcess.stdin.on("error", (err: any) => {
    if (err.code !== "EPIPE") console.error("⚠️ ffmpeg stdin error :", err);
  });
  ffmpegProcess.stdout.on("error", (err: any) => {
    if (err.code !== "EPIPE") console.error("⚠️ ffmpeg stdout error :", err);
  });
  ffmpegProcess.stderr.on("data", (data) => {
    console.error("⚠️ FFmpeg :", data.toString());
  });
  ffmpegProcess.on("error", (err) => {
    console.error("❌ Erreur au lancement de FFmpeg :", err);
  });

  ytdlpProcess.stdout?.pipe(ffmpegProcess.stdin);

  const resource = createAudioResource(ffmpegProcess.stdout, {
    inputType: StreamType.Raw,
  });

  console.log("🎧 Ressource audio créée, lancement de la lecture pour :", url);
  state.player.play(resource);
}

export async function demarrerLecture(
  guildId: string,
  connection: VoiceConnection,
  tracks: string[]
) {
  arreterMusique(guildId);

  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Play },
  });

  connection.subscribe(player);

  connection.on("stateChange", (oldState, newState) => {
    console.log(`🔌 Connexion vocale : ${oldState.status} → ${newState.status}`);
  });

  const state: GuildMusicState = {
    connection,
    player,
    tracks,
    currentIndex: 0,
    playToken: 0,
  };
  musicStates.set(guildId, state);

  player.on(AudioPlayerStatus.Idle, () => {
    const current = musicStates.get(guildId);
    if (!current) return;
    current.currentIndex = (current.currentIndex + 1) % current.tracks.length;
    jouerPiste(guildId).catch(console.error);
  });

  player.on(AudioPlayerStatus.Playing, () => {
    console.log("▶️ Le player est en train de jouer !");
  });

  player.on(AudioPlayerStatus.Buffering, () => {
    console.log("⏳ Le player buffer...");
  });

  player.on("error", (error) => {
    console.error("❌ Erreur lecteur audio :", error);
  });

  await jouerPiste(guildId);
}

export function arreterMusique(guildId: string) {
  const state = musicStates.get(guildId);
  if (!state) return;

  tuerProcessusAudio(state);
  state.player.stop();

  try {
    if (state.connection.state.status !== "destroyed") {
      state.connection.destroy();
    }
  } catch (err) {
    console.error("⚠️ Erreur en détruisant la connexion vocale (ignorée) :", err);
  }

  musicStates.delete(guildId);
}