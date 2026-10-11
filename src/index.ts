import {
  Client,
  Collection,
  GatewayIntentBits,
  ChannelType,
  GuildMember,
  Partials,
} from "discord.js";
import * as dotenv from "dotenv";
import * as ping from "./commands/ping";
import * as warn from "./commands/warn";
import * as timeout from "./commands/timeout";
import * as kick from "./commands/kick";
import * as ban from "./commands/ban";
import * as unban from "./commands/unban";
import * as history from "./commands/history";
import * as configLogs from "./commands/config-logs";
import * as blacklistAdd from "./commands/blacklist-add";
import * as unblacklist from "./commands/unblacklist";
import { handleMessageCreate } from "./events/messageCreate";
import * as untimeout from "./commands/untimeout";
import { handleGuildMemberAdd } from "./events/guildMemberAdd";
import { handleGuildMemberRemove } from "./events/guildMemberRemove";
import * as lockdown from "./commands/lockdown";
import * as configWelcome from "./commands/config-welcome";
import * as configVerification from "./commands/config-verification";
import { handleButtonInteraction } from "./events/buttonInteraction";
import * as setupVerification from "./commands/setup-verification";
import * as configTickets from "./commands/config-tickets";
import * as setupTickets from "./commands/setup-tickets";
import * as closeTicket from "./commands/close-ticket";
import * as play from "./commands/play";
import * as stop from "./commands/stop";
import * as userinfo from "./commands/userinfo";
import * as dequinonameestamoureux from "./commands/dequinonameestamoureux";
import * as overcheat from "./commands/overcheat";
import * as clear from "./commands/clear";
import * as level from "./commands/level";
import * as level99 from "./commands/99";
import * as levelset from "./commands/levelset";
import * as objectif from "./commands/objectif";
import * as setobjectif from "./commands/setobjectif";
import * as giveaway from "./commands/giveaway";
import * as cv from "./commands/cv";
import * as stats from "./commands/stats";
import * as servstats from "./commands/servstats";
import { arreterMusique } from "./music";
import { handleGuildMemberUpdate } from "./events/guildMemberUpdate";
import { actualiserSalonObjectif } from "./objectifSalon";
import { demarrerXpVocal } from "./voiceXp";
import { actualiserSalonCompteur } from "./memberCountChannel";
import { enregistrerLogs } from "./logs";
import { demarrerVerificationGiveaways, gererBoutonGiveaway } from "./giveaway";
import { demarrerSuiviInvitations, enregistrerArrivee } from "./invites";
import { demarrerSuiviVocal } from "./voiceStats";
import { demarrerAlerteAttente } from "./attenteVocale";
import {
  NOM_SALON_MATCH,
  assurerPanneau,
  gererLike,
  gererModalCv,
  gererModalEtape2,
  gererSuppression,
  ouvrirEtape2,
  ouvrirFormulaire,
  publierSansEtape2,
} from "./match";
dotenv.config();

const SALON_COMMANDES = "🤖・commandes";
const NOM_ROLE_OWNER = "OWNER";

// Commandes utilisables dans n'importe quel salon (en plus des OWNER)
const COMMANDES_PARTOUT = ["cv"];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.User,
    Partials.GuildMember,
  ],
});

// Système de logs complet dans le salon "logs-moderation"
enregistrerLogs(client);

const commands = new Collection<string, any>();
commands.set(ping.data.name, ping);
commands.set(warn.data.name, warn);
commands.set(timeout.data.name, timeout);
commands.set(kick.data.name, kick);
commands.set(ban.data.name, ban);
commands.set(unban.data.name, unban);
commands.set(history.data.name, history);
commands.set(configLogs.data.name, configLogs);
commands.set(blacklistAdd.data.name, blacklistAdd);
commands.set(unblacklist.data.name, unblacklist);
commands.set(untimeout.data.name, untimeout);
commands.set(lockdown.data.name, lockdown);
commands.set(configWelcome.data.name, configWelcome);
commands.set(configVerification.data.name, configVerification);
commands.set(setupVerification.data.name, setupVerification);
commands.set(configTickets.data.name, configTickets);
commands.set(setupTickets.data.name, setupTickets);
commands.set(closeTicket.data.name, closeTicket);
commands.set(play.data.name, play);
commands.set(stop.data.name, stop);
commands.set(userinfo.data.name, userinfo);
commands.set(dequinonameestamoureux.data.name, dequinonameestamoureux);
commands.set(overcheat.data.name, overcheat);
commands.set(clear.data.name, clear);
commands.set(level.data.name, level);
commands.set(level99.data.name, level99);
commands.set(levelset.data.name, levelset);
commands.set(objectif.data.name, objectif);
commands.set(setobjectif.data.name, setobjectif);
commands.set(giveaway.data.name, giveaway);
commands.set(cv.data.name, cv);
commands.set(stats.data.name, stats);
commands.set(servstats.data.name, servstats);

client.once("clientReady", async () => {
  console.log(`✅ Bot connecté en tant que ${client.user?.tag}`);

  // Suivi des invitations (pour les chances bonus des giveaways)
  demarrerSuiviInvitations(client);

  // Suivi du temps passé en vocal (pour /stats et /servstats)
  demarrerSuiviVocal(client);

  // Alerte aux OWNER quand quelqu'un attend dans le vocal d'attente
  demarrerAlerteAttente(client);

  // On actualise le salon objectif et le compteur de membres de chaque serveur au démarrage
  for (const [, guild] of client.guilds.cache) {
    await actualiserSalonObjectif(guild).catch((err) =>
      console.error(`⚠️ Erreur actualiserSalonObjectif au démarrage pour ${guild.name} :`, err)
    );
    await actualiserSalonCompteur(guild).catch((err) =>
      console.error(`⚠️ Erreur actualiserSalonCompteur au démarrage pour ${guild.name} :`, err)
    );

    // Trouve le salon find-a-match, le verrouille et poste le panneau s'il n'y est pas
    await assurerPanneau(guild, client).catch(console.error);
  }

  // Démarrage du système d'XP en vocal
  demarrerXpVocal(client);

  // Démarrage de la vérification des giveaways (termine ceux arrivés à échéance)
  demarrerVerificationGiveaways(client);
});

// Panneau find-a-match automatique : nouveau salon, salon renommé, nouveau serveur
client.on("channelCreate", (channel) => {
  const c: any = channel;
  if (c.type === ChannelType.GuildText && c.name.toLowerCase().includes(NOM_SALON_MATCH)) {
    setTimeout(() => assurerPanneau(c.guild, client).catch(console.error), 2000);
  }
});

client.on("channelUpdate", (ancien, nouveau) => {
  const a: any = ancien;
  const n: any = nouveau;
  if (
    n.type === ChannelType.GuildText &&
    a.name !== n.name &&
    n.name.toLowerCase().includes(NOM_SALON_MATCH)
  ) {
    setTimeout(() => assurerPanneau(n.guild, client).catch(console.error), 2000);
  }
});

client.on("guildCreate", (guild) => {
  setTimeout(() => assurerPanneau(guild, client).catch(console.error), 5000);
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isButton()) {
    // Boutons ❌ de /unblacklist
    if (interaction.customId.startsWith("unbl:")) {
      await unblacklist.gererBoutonUnblacklist(interaction).catch(console.error);
      return;
    }

    // Bouton "Participer" des giveaways
    if (interaction.customId.startsWith("giveaway_join:")) {
      await gererBoutonGiveaway(interaction).catch(console.error);
      return;
    }

    // Boutons du salon find-a-match
    if (interaction.customId === "match_open") {
      await ouvrirFormulaire(interaction).catch(console.error);
      return;
    }
    if (interaction.customId === "match_step2") {
      await ouvrirEtape2(interaction).catch(console.error);
      return;
    }
    if (interaction.customId === "match_publish") {
      await publierSansEtape2(interaction).catch(console.error);
      return;
    }
    if (interaction.customId.startsWith("match_like:")) {
      await gererLike(interaction).catch(console.error);
      return;
    }
    if (interaction.customId.startsWith("match_del:")) {
      await gererSuppression(interaction).catch(console.error);
      return;
    }

    await handleButtonInteraction(interaction).catch(console.error);
    return;
  }

  // Formulaires du CV find-a-match (étape 1 et étape 2)
  if (interaction.isModalSubmit()) {
    if (interaction.customId === "match_cv") {
      await gererModalCv(interaction).catch(console.error);
    } else if (interaction.customId === "match_cv2") {
      await gererModalEtape2(interaction).catch(console.error);
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  // Les OWNER peuvent utiliser les commandes partout, tout le monde d'autre uniquement dans le salon dédié
  const membre = interaction.member as GuildMember | null;
  const estOwner = membre?.roles.cache.some((role) => role.name === NOM_ROLE_OWNER) ?? false;

  if (
    !estOwner &&
    !COMMANDES_PARTOUT.includes(interaction.commandName) &&
    interaction.channel?.type === ChannelType.GuildText &&
    interaction.channel.name !== SALON_COMMANDES
  ) {
    await interaction.reply({
      content: `❌ Les commandes ne sont utilisables que dans <#${interaction.channel.guild.channels.cache.find(
        (c) => c.name === SALON_COMMANDES
      )?.id ?? "salon introuvable"}>.`,
      ephemeral: true,
    }).catch(() => null);
    return;
  }

  const command = commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({
        content: "❌ Une erreur est survenue lors de l'exécution de cette commande.",
      }).catch(() => null);
    } else {
      await interaction.reply({
        content: "❌ Une erreur est survenue lors de l'exécution de cette commande.",
        ephemeral: true,
      }).catch(() => null);
    }
  }
});

client.on("messageCreate", (message) => {
  handleMessageCreate(message).catch(console.error);
});

client.on("voiceStateUpdate", (oldState, newState) => {
  if (oldState.member?.id !== client.user?.id) return;

  if (oldState.channelId && !newState.channelId) {
    console.log(`🔌 Bot déconnecté du vocal sur le serveur ${oldState.guild.id} (kick/déco manuelle) — arrêt de la musique.`);
    arreterMusique(oldState.guild.id);
  }
});

client.on("guildMemberUpdate", (oldMember, newMember) => {
  handleGuildMemberUpdate(oldMember, newMember).catch(console.error);
});

client.on("guildMemberAdd", (member) => {
  handleGuildMemberAdd(member).catch(console.error);
  enregistrerArrivee(member).catch(console.error);
  actualiserSalonCompteur(member.guild).catch(console.error);
});

client.on("guildMemberRemove", (member) => {
  handleGuildMemberRemove(member).catch(console.error);
  actualiserSalonCompteur(member.guild).catch(console.error);
});

client.login(process.env.DISCORD_TOKEN!);