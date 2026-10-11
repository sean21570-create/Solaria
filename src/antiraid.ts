// On garde en mémoire les arrivées récentes, par serveur : guildId -> liste de timestamps
const arriveesRecentes = new Map<string, number[]>();

const LIMITE_ARRIVEES = 5; // nombre d'arrivées suspectes
const FENETRE_MS = 10000; // sur une fenêtre de 10 secondes

export function detecterRaid(guildId: string): boolean {
  const maintenant = Date.now();
  const historique = arriveesRecentes.get(guildId) || [];

  const arriveesDansLaFenetre = historique.filter(
    (timestamp) => maintenant - timestamp < FENETRE_MS
  );

  arriveesDansLaFenetre.push(maintenant);
  arriveesRecentes.set(guildId, arriveesDansLaFenetre);

  return arriveesDansLaFenetre.length >= LIMITE_ARRIVEES;
}

// État du lockdown par serveur : guildId -> true/false
const lockdownActif = new Map<string, boolean>();

export function activerLockdown(guildId: string) {
  lockdownActif.set(guildId, true);
}

export function desactiverLockdown(guildId: string) {
  lockdownActif.set(guildId, false);
}

export function estEnLockdown(guildId: string): boolean {
  return lockdownActif.get(guildId) === true;
}