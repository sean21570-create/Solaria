import { createCanvas, loadImage, GlobalFonts, SKRSContext2D } from "@napi-rs/canvas";
import { AttachmentBuilder, User } from "discord.js";
import * as path from "path";
import * as fs from "fs";

const LARGEUR = 1000;
const HAUTEUR = 400;

// ─── Polices (mêmes fichiers que welcomeCard.ts) ───
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

function tailleAjustee(ctx: SKRSContext2D, texte: string, tailleMax: number, largeurMax: number, style: Style) {
  let taille = tailleMax;
  while (mesurer(ctx, texte, taille, style) > largeurMax && taille > 18) taille -= 2;
  return taille;
}

function nettoyer(texte: string): string {
  return texte.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, "").replace(/\s+/g, " ").trim();
}

interface OptionsCarteDepart {
  user: User;
  nomServeur: string;
  nombreMembresRestants: number;
}

export async function genererCarteDepart({
  user,
  nomServeur,
  nombreMembresRestants,
}: OptionsCarteDepart): Promise<AttachmentBuilder> {
  chargerPolices();

  const canvas = createCanvas(LARGEUR, HAUTEUR);
  const ctx = canvas.getContext("2d");

  // Fond dégradé (teinte plus sombre/rouge, différente de la bienvenue)
  const fond = ctx.createLinearGradient(0, 0, LARGEUR, HAUTEUR);
  fond.addColorStop(0, "#1a0f0f");
  fond.addColorStop(0.5, "#3a1414");
  fond.addColorStop(1, "#241010");
  ctx.fillStyle = fond;
  ctx.fillRect(0, 0, LARGEUR, HAUTEUR);

  // Cercles décoratifs
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = "#ff4f4f";
  ctx.beginPath();
  ctx.arc(900, 60, 140, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ff9d4f";
  ctx.beginPath();
  ctx.arc(80, 360, 120, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Cadre
  ctx.strokeStyle = "#ff4f4f";
  ctx.lineWidth = 4;
  ctx.strokeRect(15, 15, LARGEUR - 30, HAUTEUR - 30);

  // Avatar rond (en niveaux de gris pour marquer le départ)
  const centreX = 200;
  const centreY = HAUTEUR / 2;
  const rayon = 110;

  try {
    const url = user.displayAvatarURL({ extension: "png", size: 256 });
    const reponse = await fetch(url);
    const buffer = Buffer.from(await reponse.arrayBuffer());
    const avatar = await loadImage(buffer);

    ctx.save();
    ctx.beginPath();
    ctx.arc(centreX, centreY, rayon, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.filter = "grayscale(70%)";
    ctx.drawImage(avatar, centreX - rayon, centreY - rayon, rayon * 2, rayon * 2);
    ctx.filter = "none";
    ctx.restore();
  } catch (err) {
    console.error("⚠️ Impossible de charger l'avatar pour la carte de départ :", err);
    ctx.fillStyle = "#5865f2";
    ctx.beginPath();
    ctx.arc(centreX, centreY, rayon, 0, Math.PI * 2);
    ctx.fill();
  }

  // Anneau autour de l'avatar
  ctx.save();
  ctx.shadowColor = "#ff4f4f";
  ctx.shadowBlur = 25;
  ctx.strokeStyle = "#ff4f4f";
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

  const nomServeurNettoye = nettoyer(nomServeur) || nomServeur;
  const pseudo = nettoyer(user.username) || "Un membre";

  ctx.fillStyle = "#ff8080";
  dessiner(ctx, "A QUITTÉ", xTexte, 125, 24, "semi", 6);

  ctx.save();
  ctx.shadowColor = "rgba(255, 79, 79, 0.55)";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "#ffffff";
  const tailleServeur = tailleAjustee(ctx, nomServeurNettoye, 56, largeurTexte, "bold");
  dessiner(ctx, nomServeurNettoye, xTexte, 192, tailleServeur, "bold");
  ctx.restore();

  const accent = ctx.createLinearGradient(xTexte, 0, xTexte + 260, 0);
  accent.addColorStop(0, "#ff4f4f");
  accent.addColorStop(1, "#ff9d4f");
  ctx.fillStyle = accent;
  ctx.fillRect(xTexte, 212, 260, 5);

  ctx.fillStyle = "#ffffff";
  const taillePseudo = tailleAjustee(ctx, pseudo, 58, largeurTexte, "bold");
  dessiner(ctx, pseudo, xTexte, 285, taillePseudo, "bold");

  ctx.fillStyle = "#c9a3a3";
  dessiner(ctx, `Il reste ${nombreMembresRestants} membre(s)`, xTexte, 335, 24, "regular");

  const image = await canvas.encode("png");
  return new AttachmentBuilder(image, { name: "depart.png" });
}