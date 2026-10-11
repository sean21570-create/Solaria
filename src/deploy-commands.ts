import { REST, Routes } from "discord.js";
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
import * as untimeout from "./commands/untimeout";
import * as lockdown from "./commands/lockdown";
import * as configWelcome from "./commands/config-welcome";
import * as configVerification from "./commands/config-verification";
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
dotenv.config();

const commands = [
  ping.data.toJSON(),
  warn.data.toJSON(),
  timeout.data.toJSON(),
  kick.data.toJSON(),
  ban.data.toJSON(),
  unban.data.toJSON(),
  history.data.toJSON(),
  configLogs.data.toJSON(),
  blacklistAdd.data.toJSON(),
  unblacklist.data.toJSON(),
  untimeout.data.toJSON(),
  lockdown.data.toJSON(),
  configWelcome.data.toJSON(),
  configVerification.data.toJSON(),
  setupVerification.data.toJSON(),
  configTickets.data.toJSON(),
  setupTickets.data.toJSON(),
  closeTicket.data.toJSON(),
  play.data.toJSON(),
  stop.data.toJSON(),
  userinfo.data.toJSON(),
  dequinonameestamoureux.data.toJSON(),
  overcheat.data.toJSON(),
  clear.data.toJSON(),
  level.data.toJSON(),
  level99.data.toJSON(),
  levelset.data.toJSON(),
  objectif.data.toJSON(),
  setobjectif.data.toJSON(),
  giveaway.data.toJSON(),
  cv.data.toJSON(),
  stats.data.toJSON(),
  servstats.data.toJSON(),
];

const rest = new REST().setToken(process.env.DISCORD_TOKEN!);

async function deploy() {
  try {
    console.log("⏳ Déploiement des commandes slash...");

    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID!, "1512872958954307584"),
      { body: commands }
    );

    console.log("✅ Commandes slash déployées avec succès !");
  } catch (error) {
    console.error(error);
  }
}

deploy();