import {
  AuditLogEvent,
  ChannelType,
  Client,
  EmbedBuilder,
  Guild,
  TextChannel,
} from "discord.js";

const NOM_SALON_LOGS = "logs-moderation";

const COULEURS = {
  vert: 0x57f287,
  rouge: 0xed4245,
  orange: 0xfaa61a,
  bleu: 0x5865f2,
  gris: 0x99aab5,
};

type Champ = { name: string; value: string };

function coupe(texte: string | null | undefined, max = 1000): string {
  if (!texte) return "*(vide)*";
  return texte.length > max ? texte.slice(0, max) + "…" : texte;
}

function salonLogs(guild: Guild): TextChannel | undefined {
  return guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name === NOM_SALON_LOGS
  ) as TextChannel | undefined;
}

async function envoyer(guild: Guild, embed: EmbedBuilder) {
  const salon = salonLogs(guild);
  if (!salon) return;
  embed.setTimestamp();
  await salon.send({ embeds: [embed] }).catch((err) => {
    console.error("⚠️ Impossible d'envoyer un log :", err?.message ?? err);
  });
}

// Cherche qui a fait l'action dans les audit logs (permission "Voir les logs du serveur")
async function executeur(guild: Guild, type: AuditLogEvent, cibleId?: string): Promise<string> {
  try {
    await new Promise((r) => setTimeout(r, 1000)); // laisse Discord écrire l'audit log
    const logs = await guild.fetchAuditLogs({ type, limit: 5 });
    const entree = logs.entries.find(
      (e) =>
        Date.now() - e.createdTimestamp < 10_000 &&
        (!cibleId || (e.target as any)?.id === cibleId)
    );
    return entree?.executor ? `<@${entree.executor.id}> (${entree.executor.tag})` : "Inconnu";
  } catch {
    return "Inconnu";
  }
}

// Les déconnexions / déplacements vocaux n'ont PAS de cible dans l'audit log, seulement un compteur.
// On mémorise le compteur de chaque entrée pour détecter une nouvelle action (ou un compteur qui augmente).
const compteursVocaux = new Map<string, number>();

async function actionVocale(guild: Guild, type: AuditLogEvent): Promise<string | null> {
  try {
    await new Promise((r) => setTimeout(r, 1000));
    const logs = await guild.fetchAuditLogs({ type, limit: 1 });
    const entree = logs.entries.first();
    if (!entree || !entree.executor) return null;

    const count = Number((entree.extra as any)?.count ?? 1);
    const cle = `${guild.id}:${type}:${entree.id}`;
    const precedent = compteursVocaux.get(cle);
    compteursVocaux.set(cle, count);

    const recente = Date.now() - entree.createdTimestamp < 10_000;
    const nouvelleAction = precedent === undefined ? recente : count > precedent;

    return nouvelleAction ? `<@${entree.executor.id}> (${entree.executor.tag})` : null;
  } catch {
    return null;
  }
}

// Le salon compteur est recréé à chaque arrivée/départ : on l'ignore pour ne pas spammer
const estSalonCompteur = (c: any) => !!c?.name?.toLowerCase?.().startsWith("members");

export function enregistrerLogs(client: Client) {
  // ───────── MESSAGES ─────────
  client.on("messageDelete", async (m: any) => {
    if (!m.guild) return;
    if (m.channel?.name === NOM_SALON_LOGS) return;
    const qui = await executeur(m.guild, AuditLogEvent.MessageDelete, m.author?.id);
    await envoyer(
      m.guild,
      new EmbedBuilder()
        .setColor(COULEURS.rouge)
        .setTitle("🗑️ Message supprimé")
        .addFields(
          {
            name: "Auteur",
            value: m.author ? `<@${m.author.id}> (${m.author.tag})` : "Inconnu (pas en cache)",
            inline: true,
          },
          { name: "Salon", value: `<#${m.channelId}>`, inline: true },
          { name: "Supprimé par", value: qui, inline: true },
          { name: "Contenu", value: coupe(m.content) }
        )
        .setFooter({ text: `ID message : ${m.id}` })
    );
  });

  client.on("messageDeleteBulk", async (messages: any, channel: any) => {
    if (!channel.guild) return;
    await envoyer(
      channel.guild,
      new EmbedBuilder()
        .setColor(COULEURS.rouge)
        .setTitle("🧹 Suppression en masse")
        .setDescription(`**${messages.size}** messages supprimés dans <#${channel.id}>`)
    );
  });

  client.on("messageUpdate", async (ancien: any, nouveau: any) => {
    if (!nouveau.guild || ancien.content === nouveau.content) return;
    if (nouveau.channel?.name === NOM_SALON_LOGS) return;
    await envoyer(
      nouveau.guild,
      new EmbedBuilder()
        .setColor(COULEURS.orange)
        .setTitle("✏️ Message modifié")
        .addFields(
          {
            name: "Auteur",
            value: nouveau.author ? `<@${nouveau.author.id}> (${nouveau.author.tag})` : "Inconnu",
            inline: true,
          },
          { name: "Salon", value: `<#${nouveau.channelId}>`, inline: true },
          { name: "Avant", value: coupe(ancien.content) },
          { name: "Après", value: coupe(nouveau.content) },
          { name: "Lien", value: nouveau.url }
        )
    );
  });

  client.on("messageReactionAdd", async (r: any, u: any) => {
    try {
      if (r.partial) await r.fetch();
      if (r.message.partial) await r.message.fetch();
    } catch {
      return;
    }
    if (!r.message.guild) return;
    await envoyer(
      r.message.guild,
      new EmbedBuilder()
        .setColor(COULEURS.gris)
        .setTitle("➕ Réaction ajoutée")
        .setDescription(`<@${u.id}> a réagi ${r.emoji.toString()} sur [ce message](${r.message.url})`)
    );
  });

  client.on("messageReactionRemove", async (r: any, u: any) => {
    try {
      if (r.partial) await r.fetch();
      if (r.message.partial) await r.message.fetch();
    } catch {
      return;
    }
    if (!r.message.guild) return;
    await envoyer(
      r.message.guild,
      new EmbedBuilder()
        .setColor(COULEURS.gris)
        .setTitle("➖ Réaction retirée")
        .setDescription(`<@${u.id}> a retiré ${r.emoji.toString()} sur [ce message](${r.message.url})`)
    );
  });

  // ───────── MEMBRES ─────────
  client.on("guildMemberAdd", async (m) => {
    await envoyer(
      m.guild,
      new EmbedBuilder()
        .setColor(COULEURS.vert)
        .setTitle("📥 Membre arrivé")
        .setDescription(`<@${m.id}> (${m.user.tag})`)
        .addFields({
          name: "Compte créé",
          value: `<t:${Math.floor(m.user.createdTimestamp / 1000)}:R>`,
        })
        .setThumbnail(m.user.displayAvatarURL())
        .setFooter({ text: `ID : ${m.id}` })
    );
  });

  client.on("guildMemberRemove", async (m) => {
    const kick = await executeur(m.guild, AuditLogEvent.MemberKick, m.id);
    const roles =
      m.roles?.cache
        .filter((r) => r.name !== "@everyone")
        .map((r) => r.name)
        .join(", ") || "Aucun";
    await envoyer(
      m.guild,
      new EmbedBuilder()
        .setColor(COULEURS.rouge)
        .setTitle(kick !== "Inconnu" ? "👢 Membre expulsé" : "📤 Membre parti")
        .setDescription(`<@${m.id}> (${m.user.tag})`)
        .addFields(
          { name: "Expulsé par", value: kick, inline: true },
          { name: "Rôles", value: coupe(roles) }
        )
        .setFooter({ text: `ID : ${m.id}` })
    );
  });

  client.on("guildMemberUpdate", async (ancien: any, nouveau) => {
    const champs: Champ[] = [];

    if (ancien.nickname !== nouveau.nickname) {
      champs.push({
        name: "Pseudo",
        value: `${ancien.nickname ?? "aucun"} → ${nouveau.nickname ?? "aucun"}`,
      });
    }

    const ajoutes = nouveau.roles.cache.filter((r) => !ancien.roles?.cache.has(r.id));
    const retires = ancien.roles?.cache.filter((r: any) => !nouveau.roles.cache.has(r.id));
    if (ajoutes.size) champs.push({ name: "Rôles ajoutés", value: ajoutes.map((r) => r.name).join(", ") });
    if (retires?.size) champs.push({ name: "Rôles retirés", value: retires.map((r: any) => r.name).join(", ") });

    if (ancien.communicationDisabledUntilTimestamp !== nouveau.communicationDisabledUntilTimestamp) {
      champs.push({
        name: "Timeout",
        value: nouveau.communicationDisabledUntilTimestamp
          ? `Jusqu'à <t:${Math.floor(nouveau.communicationDisabledUntilTimestamp / 1000)}:F>`
          : "Retiré",
      });
    }

    if (!champs.length) return;
    const qui = await executeur(nouveau.guild, AuditLogEvent.MemberUpdate, nouveau.id);
    await envoyer(
      nouveau.guild,
      new EmbedBuilder()
        .setColor(COULEURS.bleu)
        .setTitle("👤 Membre modifié")
        .setDescription(`<@${nouveau.id}> (${nouveau.user.tag})\nModifié par : ${qui}`)
        .addFields(champs)
    );
  });

  client.on("userUpdate", async (ancien, nouveau) => {
    if (ancien.tag === nouveau.tag && ancien.avatar === nouveau.avatar) return;
    for (const guild of client.guilds.cache.values()) {
      if (!guild.members.cache.has(nouveau.id)) continue;
      await envoyer(
        guild,
        new EmbedBuilder()
          .setColor(COULEURS.bleu)
          .setTitle("🪪 Profil modifié")
          .setDescription(`<@${nouveau.id}>\n${ancien.tag} → ${nouveau.tag}`)
          .setThumbnail(nouveau.displayAvatarURL())
      );
    }
  });

  // ───────── BANS ─────────
  client.on("guildBanAdd", async (ban) => {
    const qui = await executeur(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
    await envoyer(
      ban.guild,
      new EmbedBuilder()
        .setColor(COULEURS.rouge)
        .setTitle("🔨 Membre banni")
        .setDescription(`<@${ban.user.id}> (${ban.user.tag})`)
        .addFields(
          { name: "Banni par", value: qui, inline: true },
          { name: "Raison", value: coupe(ban.reason ?? "Aucune"), inline: true }
        )
    );
  });

  client.on("guildBanRemove", async (ban) => {
    const qui = await executeur(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);
    await envoyer(
      ban.guild,
      new EmbedBuilder()
        .setColor(COULEURS.vert)
        .setTitle("🔓 Membre débanni")
        .setDescription(`<@${ban.user.id}> (${ban.user.tag})\nPar : ${qui}`)
    );
  });

  // ───────── SALONS ─────────
  client.on("channelCreate", async (c: any) => {
    if (!c.guild || estSalonCompteur(c)) return;
    const qui = await executeur(c.guild, AuditLogEvent.ChannelCreate, c.id);
    await envoyer(
      c.guild,
      new EmbedBuilder()
        .setColor(COULEURS.vert)
        .setTitle("📁 Salon créé")
        .setDescription(`<#${c.id}> (${c.name})\nPar : ${qui}`)
    );
  });

  client.on("channelDelete", async (c: any) => {
    if (!c.guild || estSalonCompteur(c)) return;
    const qui = await executeur(c.guild, AuditLogEvent.ChannelDelete, c.id);
    await envoyer(
      c.guild,
      new EmbedBuilder()
        .setColor(COULEURS.rouge)
        .setTitle("🗑️ Salon supprimé")
        .setDescription(`**${c.name}**\nPar : ${qui}`)
    );
  });

  client.on("channelUpdate", async (ancien: any, nouveau: any) => {
    if (!nouveau.guild || estSalonCompteur(nouveau)) return;
    const champs: Champ[] = [];
    if (ancien.name !== nouveau.name) champs.push({ name: "Nom", value: `${ancien.name} → ${nouveau.name}` });
    if (ancien.topic !== nouveau.topic)
      champs.push({ name: "Sujet", value: `${coupe(ancien.topic, 400)} → ${coupe(nouveau.topic, 400)}` });
    if (ancien.parentId !== nouveau.parentId)
      champs.push({
        name: "Catégorie",
        value: `${ancien.parent?.name ?? "aucune"} → ${nouveau.parent?.name ?? "aucune"}`,
      });
    if (ancien.rateLimitPerUser !== nouveau.rateLimitPerUser)
      champs.push({ name: "Mode lent", value: `${ancien.rateLimitPerUser}s → ${nouveau.rateLimitPerUser}s` });
    if (ancien.nsfw !== nouveau.nsfw) champs.push({ name: "NSFW", value: `${ancien.nsfw} → ${nouveau.nsfw}` });

    if (!champs.length) {
      const signature = (c: any) =>
        JSON.stringify(
          c.permissionOverwrites?.cache.map((p: any) => [p.id, p.allow.bitfield.toString(), p.deny.bitfield.toString()])
        );
      if (signature(ancien) !== signature(nouveau)) {
        champs.push({ name: "Permissions", value: "Les permissions du salon ont été modifiées" });
      }
    }

    if (!champs.length) return;
    const qui = await executeur(nouveau.guild, AuditLogEvent.ChannelUpdate, nouveau.id);
    await envoyer(
      nouveau.guild,
      new EmbedBuilder()
        .setColor(COULEURS.orange)
        .setTitle("⚙️ Salon modifié")
        .setDescription(`<#${nouveau.id}>\nPar : ${qui}`)
        .addFields(champs)
    );
  });

  client.on("threadCreate", async (t) => {
    await envoyer(
      t.guild,
      new EmbedBuilder()
        .setColor(COULEURS.vert)
        .setTitle("🧵 Thread créé")
        .setDescription(`<#${t.id}> dans <#${t.parentId}>`)
    );
  });

  client.on("threadDelete", async (t) => {
    await envoyer(
      t.guild,
      new EmbedBuilder().setColor(COULEURS.rouge).setTitle("🧵 Thread supprimé").setDescription(`**${t.name}**`)
    );
  });

  // ───────── RÔLES ─────────
  client.on("roleCreate", async (r) => {
    const qui = await executeur(r.guild, AuditLogEvent.RoleCreate, r.id);
    await envoyer(
      r.guild,
      new EmbedBuilder().setColor(COULEURS.vert).setTitle("🏷️ Rôle créé").setDescription(`**${r.name}**\nPar : ${qui}`)
    );
  });

  client.on("roleDelete", async (r) => {
    const qui = await executeur(r.guild, AuditLogEvent.RoleDelete, r.id);
    await envoyer(
      r.guild,
      new EmbedBuilder().setColor(COULEURS.rouge).setTitle("🏷️ Rôle supprimé").setDescription(`**${r.name}**\nPar : ${qui}`)
    );
  });

  client.on("roleUpdate", async (ancien, nouveau) => {
    const champs: Champ[] = [];
    if (ancien.name !== nouveau.name) champs.push({ name: "Nom", value: `${ancien.name} → ${nouveau.name}` });
    if (ancien.hexColor !== nouveau.hexColor)
      champs.push({ name: "Couleur", value: `${ancien.hexColor} → ${nouveau.hexColor}` });
    if (ancien.permissions.bitfield !== nouveau.permissions.bitfield)
      champs.push({ name: "Permissions", value: "Modifiées" });
    if (ancien.hoist !== nouveau.hoist)
      champs.push({ name: "Affiché séparément", value: `${ancien.hoist} → ${nouveau.hoist}` });
    if (!champs.length) return;
    const qui = await executeur(nouveau.guild, AuditLogEvent.RoleUpdate, nouveau.id);
    await envoyer(
      nouveau.guild,
      new EmbedBuilder()
        .setColor(COULEURS.orange)
        .setTitle("🏷️ Rôle modifié")
        .setDescription(`<@&${nouveau.id}>\nPar : ${qui}`)
        .addFields(champs)
    );
  });

  // ───────── VOCAL ─────────
  client.on("voiceStateUpdate", async (ancien, nouveau) => {
    const guild = nouveau.guild;
    let titre = "🎙️ Vocal";
    let couleur = COULEURS.bleu;
    let texte: string | null = null;

    if (!ancien.channelId && nouveau.channelId) {
      texte = `a rejoint <#${nouveau.channelId}>`;
    } else if (ancien.channelId && !nouveau.channelId) {
      // Quitté : déco volontaire ou déconnecté par quelqu'un d'autre ?
      const qui = await actionVocale(guild, AuditLogEvent.MemberDisconnect);
      if (qui) {
        titre = "🔌 Déconnexion forcée";
        couleur = COULEURS.rouge;
        texte = `a été déconnecté de <#${ancien.channelId}> par ${qui}`;
      } else {
        texte = `a quitté <#${ancien.channelId}>`;
      }
    } else if (ancien.channelId !== nouveau.channelId) {
      // Changement de salon : volontaire ou déplacé par quelqu'un d'autre ?
      const qui = await actionVocale(guild, AuditLogEvent.MemberMove);
      if (qui) {
        titre = "↔️ Déplacement forcé";
        couleur = COULEURS.orange;
        texte = `a été déplacé de <#${ancien.channelId}> vers <#${nouveau.channelId}> par ${qui}`;
      } else {
        texte = `a changé de <#${ancien.channelId}> vers <#${nouveau.channelId}>`;
      }
    } else if (ancien.serverMute !== nouveau.serverMute) {
      const qui = await executeur(guild, AuditLogEvent.MemberUpdate, nouveau.id);
      couleur = COULEURS.orange;
      texte = nouveau.serverMute
        ? `a été mute par un modérateur (${qui})`
        : `n'est plus mute par un modérateur (${qui})`;
    } else if (ancien.serverDeaf !== nouveau.serverDeaf) {
      const qui = await executeur(guild, AuditLogEvent.MemberUpdate, nouveau.id);
      couleur = COULEURS.orange;
      texte = nouveau.serverDeaf
        ? `a été mis sourd par un modérateur (${qui})`
        : `n'est plus sourd (modérateur : ${qui})`;
    } else if (ancien.selfMute !== nouveau.selfMute) {
      texte = nouveau.selfMute ? "s'est mute" : "s'est démute";
    } else if (ancien.selfDeaf !== nouveau.selfDeaf) {
      texte = nouveau.selfDeaf ? "s'est mis sourd" : "n'est plus sourd";
    } else if (ancien.streaming !== nouveau.streaming) {
      texte = nouveau.streaming ? "a lancé un stream" : "a arrêté son stream";
    } else if (ancien.selfVideo !== nouveau.selfVideo) {
      texte = nouveau.selfVideo ? "a activé sa caméra" : "a coupé sa caméra";
    }

    if (!texte) return;
    await envoyer(
      guild,
      new EmbedBuilder().setColor(couleur).setTitle(titre).setDescription(`<@${nouveau.id}> ${texte}`)
    );
  });

  // ───────── INVITATIONS ─────────
  client.on("inviteCreate", async (i) => {
    if (!i.guild) return;
    await envoyer(
      i.guild as Guild,
      new EmbedBuilder()
        .setColor(COULEURS.vert)
        .setTitle("🔗 Invitation créée")
        .setDescription(
          `Code : \`${i.code}\`\nPar : ${i.inviter ? `<@${i.inviter.id}>` : "Inconnu"}\nSalon : <#${i.channelId}>`
        )
    );
  });

  client.on("inviteDelete", async (i) => {
    if (!i.guild) return;
    await envoyer(
      i.guild as Guild,
      new EmbedBuilder().setColor(COULEURS.rouge).setTitle("🔗 Invitation supprimée").setDescription(`Code : \`${i.code}\``)
    );
  });

  // ───────── EMOJIS ─────────
  client.on("emojiCreate", async (e) => {
    await envoyer(
      e.guild,
      new EmbedBuilder().setColor(COULEURS.vert).setTitle("😀 Emoji ajouté").setDescription(`${e.toString()} \`${e.name}\``)
    );
  });

  client.on("emojiDelete", async (e) => {
    await envoyer(
      e.guild,
      new EmbedBuilder().setColor(COULEURS.rouge).setTitle("😀 Emoji supprimé").setDescription(`\`${e.name}\``)
    );
  });

  client.on("emojiUpdate", async (a, n) => {
    if (a.name === n.name) return;
    await envoyer(
      n.guild,
      new EmbedBuilder()
        .setColor(COULEURS.orange)
        .setTitle("😀 Emoji renommé")
        .setDescription(`${n.toString()} ${a.name} → ${n.name}`)
    );
  });

  // ───────── SERVEUR ─────────
  client.on("guildUpdate", async (a, n) => {
    const champs: Champ[] = [];
    if (a.name !== n.name) champs.push({ name: "Nom", value: `${a.name} → ${n.name}` });
    if (a.icon !== n.icon) champs.push({ name: "Icône", value: "Modifiée" });
    if (a.banner !== n.banner) champs.push({ name: "Bannière", value: "Modifiée" });
    if (a.verificationLevel !== n.verificationLevel)
      champs.push({ name: "Niveau de vérification", value: `${a.verificationLevel} → ${n.verificationLevel}` });
    if (a.ownerId !== n.ownerId) champs.push({ name: "Propriétaire", value: `<@${a.ownerId}> → <@${n.ownerId}>` });
    if (!champs.length) return;
    const qui = await executeur(n, AuditLogEvent.GuildUpdate);
    await envoyer(
      n,
      new EmbedBuilder().setColor(COULEURS.orange).setTitle("🏰 Serveur modifié").setDescription(`Par : ${qui}`).addFields(champs)
    );
  });

  // ───────── COMMANDES SLASH ─────────
  client.on("interactionCreate", async (i) => {
    if (!i.isChatInputCommand() || !i.guild) return;
    const options = i.options.data.map((o) => `${o.name}: ${o.value}`).join(", ");
    await envoyer(
      i.guild,
      new EmbedBuilder()
        .setColor(COULEURS.gris)
        .setTitle("⌨️ Commande utilisée")
        .setDescription(
          `<@${i.user.id}> a fait \`/${i.commandName}\`${options ? ` (${coupe(options, 300)})` : ""} dans <#${i.channelId}>`
        )
    );
  });

  console.log(`📋 Système de logs actif (salon "${NOM_SALON_LOGS}")`);
}