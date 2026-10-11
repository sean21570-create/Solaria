// On garde en mémoire les derniers messages de chaque membre : userId -> liste de timestamps
const messagesRecents = new Map<string, number[]>();

const LIMITE_MESSAGES = 5; // nombre de messages autorisés
const FENETRE_MS = 5000; // sur une fenêtre de 5 secondes

export function detecterSpam(userId: string): boolean {
  const maintenant = Date.now();
  const historique = messagesRecents.get(userId) || [];

  // On ne garde que les messages envoyés dans la fenêtre de temps
  const messagesRecentsDuMembre = historique.filter(
    (timestamp) => maintenant - timestamp < FENETRE_MS
  );

  messagesRecentsDuMembre.push(maintenant);
  messagesRecents.set(userId, messagesRecentsDuMembre);

  return messagesRecentsDuMembre.length > LIMITE_MESSAGES;
}

export function reinitialiserSpam(userId: string) {
  messagesRecents.delete(userId);
}