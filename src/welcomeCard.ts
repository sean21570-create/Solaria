import { createCanvas, loadImage, GlobalFonts, SKRSContext2D } from "@napi-rs/canvas";
import { AttachmentBuilder, GuildMember } from "discord.js";
import * as path from "path";
import * as fs from "fs";

const LARGEUR = 1000;
const HAUTEUR = 400;

// ─── Polices ───
// Poppins pour le texte latin, Noto Sans JP pour les kanji/kana (sinon carrés vides)
const DOSSIER_POLICES = path.join(process.cwd(), "node_modules", "@expo-google-fonts");

const POLICES = [
  { fichier: "poppins/700Bold/Poppins_700Bold.ttf", famille: "SolPoppinsBold" },
  { fichier: "poppins/600SemiBold/Poppins_600SemiBold.ttf", famille: "SolPoppinsSemi" },
  { fichier: "poppins/400Regular/Poppins_400Regular.ttf", famille: "SolPoppinsRegular" },
  { fichier: "noto-sans-jp/700Bold/NotoSansJP_700Bold.ttf", famille: "SolNotoBold" },
  { fichier: "noto-sans-jp/400Regular/NotoSansJP_400Regular.ttf", famille: "SolNotoRegular" },
];

let policesChargees = false;
function chargerPolices() {
  if (policesChargees) return;
  policesChargees = true;
  for (const { fichier, famille } of POLICES) {
    const chemin = path.join(DOSSIER_POLICES, fichier);
    if (fs.existsSync(chemin)) {
      GlobalFonts.registerFromPath(chemin, famille);
    } else {
      console.error(`⚠️ Police introuvable : ${chemin} (lance : npm install @expo-google-fonts/poppins @expo-google-fonts/noto-sans-jp)`);
    }
  }
}

type Style = "bold" | "semi" | "regular";

function familleLatin(style: Style) {
  return style === "bold" ? "SolPoppinsBold" : style === "semi" ? "SolPoppinsSemi" : "SolPoppinsRegular";
}
function familleCjk(style: Style) {
  return style === "regular" ? "SolNotoRegular" : "SolNotoBold";
}

const REGEX_CJK = /[\u3000-\u30FF\u3400-\u9FFF\uFF00-\uFFEF]/;

// Découpe le texte en segments (latin / cjk) pour utiliser la bonne police sur chaque caractère
function decouper(texte: string): { texte: string; cjk: boolean }[] {
  const segments: { texte: string; cjk: boolean }[] = [];
  for (const caractere of Array.from(texte)) {
    const cjk = REGEX_CJK.test(caractere);
    const dernier = segments[segments.length - 1];
    if (dernier && dernier.cjk === cjk) dernier.texte += caractere;
    else segments.push({ texte: caractere, cjk });
  }
  return segments;
}

function mesurer(ctx: SKRSContext2D, texte: string, taille: number, style: Style, espacement = 0): number {
  let largeur = 0;
  for (const seg of decouper(texte)) {
    ctx.font = `${taille}px ${seg.cjk ? familleCjk(style) : familleLatin(style)}`;
    largeur += ctx.measureText(seg.texte).width + espacement * Array.from(seg.texte).length;
  }
  return largeur;
}

function dessiner(
  ctx: SKRSContext2D,
  texte: string,
  x: number,
  y: number,
  taille: number,
  style: Style,
  espacement = 0
) {
  let curseur = x;
  for (const seg of decouper(texte)) {
    ctx.font = `${taille}px ${seg.cjk ? familleCjk(style) : familleLatin(style)}`;
    if (espacement > 0) {
      for (const c of Array.from(seg.texte)) {
        ctx.fillText(c, curseur, y);
        curseur += ctx.measureText(c).width + espacement;
      }
    } else {
      ctx.fillText(seg.texte, curseur, y);
      curseur += ctx.measureText(seg.texte).width;
    }
  }
}

// Réduit la taille jusqu'à ce que le texte rentre dans la largeur donnée
function tailleAjustee(ctx: SKRSContext2D, texte: string, tailleMax: number, largeurMax: number, style: Style) {
  let taille = tailleMax;
  while (mesurer(ctx, texte, taille, style) > largeurMax && taille > 18) taille -= 2;
  return taille;
}

// Les emojis ne sont pas dans les polices : on les retire pour éviter les carrés vides
function nettoyer(texte: string): string {
  return texte.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, "").replace(/\s+/g, " ").trim();
}

export async function genererCarteBienvenue(member: GuildMember): Promise<AttachmentBuilder> {
  chargerPolices();

  const canvas = createCanvas(LARGEUR, HAUTEUR);
  const ctx = canvas.getContext("2d");

  // Fond dégradé
  const fond = ctx.createLinearGradient(0, 0, LARGEUR, HAUTEUR);
  fond.addColorStop(0, "#0f0c29");
  fond.addColorStop(0.5, "#302b63");
  fond.addColorStop(1, "#24243e");
  ctx.fillStyle = fond;
  ctx.fillRect(0, 0, LARGEUR, HAUTEUR);

  // Cercles décoratifs
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = "#00d4ff";
  ctx.beginPath();
  ctx.arc(900, 60, 140, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ff4fd8";
  ctx.beginPath();
  ctx.arc(80, 360, 120, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Cadre
  ctx.strokeStyle = "#00d4ff";
  ctx.lineWidth = 4;
  ctx.strokeRect(15, 15, LARGEUR - 30, HAUTEUR - 30);

  // Avatar rond
  const centreX = 200;
  const centreY = HAUTEUR / 2;
  const rayon = 110;

  try {
    const url = member.user.displayAvatarURL({ extension: "png", size: 256 });
    const reponse = await fetch(url);
    const buffer = Buffer.from(await reponse.arrayBuffer());
    const avatar = await loadImage(buffer);

    ctx.save();
    ctx.beginPath();
    ctx.arc(centreX, centreY, rayon, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, centreX - rayon, centreY - rayon, rayon * 2, rayon * 2);
    ctx.restore();
  } catch (err) {
    console.error("⚠️ Impossible de charger l'avatar pour la carte de bienvenue :", err);
    ctx.fillStyle = "#5865f2";
    ctx.beginPath();
    ctx.arc(centreX, centreY, rayon, 0, Math.PI * 2);
    ctx.fill();
  }

  // Anneau lumineux autour de l'avatar
  ctx.save();
  ctx.shadowColor = "#00d4ff";
  ctx.shadowBlur = 25;
  ctx.strokeStyle = "#00d4ff";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(centreX, centreY, rayon + 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Textes
  const xTexte = 350;
  const largeurTexte = LARGEUR - xTexte - 50;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  const nomServeur = nettoyer(member.guild.name) || member.guild.name;
  const pseudo = nettoyer(member.user.username) || "Nouveau membre";

  // "BIENVENUE SUR" espacé, en cyan
  ctx.fillStyle = "#00d4ff";
  dessiner(ctx, "BIENVENUE SUR", xTexte, 125, 24, "semi", 6);

  // Nom du serveur avec lueur
  ctx.save();
  ctx.shadowColor = "rgba(0, 212, 255, 0.55)";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "#ffffff";
  const tailleServeur = tailleAjustee(ctx, nomServeur, 56, largeurTexte, "bold");
  dessiner(ctx, nomServeur, xTexte, 192, tailleServeur, "bold");
  ctx.restore();

  // Ligne d'accent en dégradé
  const accent = ctx.createLinearGradient(xTexte, 0, xTexte + 260, 0);
  accent.addColorStop(0, "#00d4ff");
  accent.addColorStop(1, "#ff4fd8");
  ctx.fillStyle = accent;
  ctx.fillRect(xTexte, 212, 260, 5);

  // Pseudo du nouveau membre
  ctx.fillStyle = "#ffffff";
  const taillePseudo = tailleAjustee(ctx, pseudo, 58, largeurTexte, "bold");
  dessiner(ctx, pseudo, xTexte, 285, taillePseudo, "bold");

  // Numéro de membre
  ctx.fillStyle = "#b8b8d1";
  dessiner(ctx, `Tu es le membre n°${member.guild.memberCount}`, xTexte, 335, 24, "regular");

  const image = await canvas.encode("png");
  return new AttachmentBuilder(image, { name: "bienvenue.png" });
}