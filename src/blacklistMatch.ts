// Détection de mots interdits : uniquement le MOT ENTIER (pas à l'intérieur d'un autre mot)

function normaliser(texte: string): string {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // "é" -> "e", donc "Pédé" et "pede" sont traités pareil
}

function echapper(texte: string): string {
  return texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Renvoie le mot interdit trouvé dans le message, ou null s'il n'y en a aucun
export function trouverMotInterdit(message: string, motsInterdits: string[]): string | null {
  const texte = normaliser(message);

  for (const mot of motsInterdits) {
    const propre = normaliser(mot).trim();
    if (!propre) continue;

    // Le mot ne doit être collé ni à une lettre ni à un chiffre, ni avant ni après
    const regex = new RegExp(`(?<![\\p{L}\\p{N}])${echapper(propre)}(?![\\p{L}\\p{N}])`, "u");
    if (regex.test(texte)) return mot;
  }

  return null;
}