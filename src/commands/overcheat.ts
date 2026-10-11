import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
} from "discord.js";

const INTERVALLE_MS = 2000; // vitesse du changement de couleur
const PREFIXE_ROLE = "RGB - ";

// userId -> intervalle en cours (pour pouvoir l'arrêter)
const intervallesActifs = new Map<string, NodeJS.Timeout>();

function hslVersHex(h: number, s: number, l: number): number {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const r = Math.round(255 * f(0));
  const g = Math.round(255 * f(8));
  const b = Math.round(255 * f(4));
  return (r << 16) + (g << 8) + b;
}

export const data = new SlashCommandBuilder()
  .setName("overcheat")
  .setDescription("Fait clignoter ton pseudo en RGB")
  .addSubcommand((sub) =>
    sub.setName("start").setDescription("Active l'effet RGB sur ton pseudo")
  )
  .addSubcommand((sub) =>
    sub.setName("stop").setDescription("Désactive l'effet RGB")
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const sousCommande = interaction.options.getSubcommand();
  const membre = interaction.member as GuildMember;
  const guild = interaction.guild!;

  if (sousCommande === "start") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const ancienIntervalle = intervallesActifs.get(membre.id);
    if (ancienIntervalle) clearInterval(ancienIntervalle);

    const nomRole = `${PREFIXE_ROLE}${membre.user.username}`;

    let role = guild.roles.cache.find((r) => r.name === nomRole);

    if (!role) {
      try {
        role = await guild.roles.create({
          name: nomRole,
          colors: { primaryColor: 0xffffff },
          hoist: false,
          mentionable: false,
          reason: `Rôle RGB pour ${membre.user.tag}`,
        });
      } catch (err) {
        console.error("❌ Impossible de créer le rôle RGB :", err);
        await interaction.editReply(
          "❌ Impossible de créer le rôle (vérifie que mon rôle est bien positionné au-dessus dans la hiérarchie)."
        );
        return;
      }
    }

    // On remonte le rôle tout en haut de la hiérarchie (juste en dessous du rôle le plus haut du bot)
    const botMember = guild.members.me;
    if (botMember) {
      const positionMaxBot = botMember.roles.highest.position;
      const positionCible = Math.max(1, positionMaxBot - 1);

      try {
        await role.setPosition(positionCible);
      } catch (err) {
        console.error("⚠️ Impossible de repositionner le rôle RGB en haut :", err);
      }
    }

    if (!membre.roles.cache.has(role.id)) {
      await membre.roles.add(role).catch(async (err) => {
        console.error("❌ Impossible d'attribuer le rôle RGB :", err);
        await interaction.editReply(
          "❌ Impossible de t'attribuer le rôle (vérifie ma position dans la hiérarchie des rôles)."
        );
        return;
      });
    }

    let teinte = 0;
    const roleId = role.id;

    const intervalle = setInterval(async () => {
      teinte = (teinte + 10) % 360;
      const couleur = hslVersHex(teinte, 100, 50);

      const roleActuel = guild.roles.cache.get(roleId);
      if (!roleActuel) {
        clearInterval(intervalle);
        intervallesActifs.delete(membre.id);
        return;
      }

      await roleActuel
        .edit({ colors: { primaryColor: couleur } })
        .catch((err) => {
          console.error("⚠️ Erreur changement couleur RGB :", err);
        });
    }, INTERVALLE_MS);

    intervallesActifs.set(membre.id, intervalle);

    await interaction.editReply(
      "✅ Effet RGB activé sur ton pseudo (placé tout en haut de la hiérarchie) ! Utilise `/overcheat stop` pour désactiver."
    );
  } else if (sousCommande === "stop") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const intervalle = intervallesActifs.get(membre.id);
    if (intervalle) {
      clearInterval(intervalle);
      intervallesActifs.delete(membre.id);
    }

    const nomRole = `${PREFIXE_ROLE}${membre.user.username}`;
    const role = guild.roles.cache.find((r) => r.name === nomRole);

    if (role) {
      await membre.roles.remove(role).catch(() => null);
      await role.delete("Fin de l'effet RGB").catch(() => null);
    }

    await interaction.editReply("🛑 Effet RGB désactivé.");
  }
}