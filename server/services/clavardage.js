const { ErreurApi } = require('./erreur-api.js');
const { trouverPartieParId } = require('../repository/parties.js');
const { ajouterMessage, listerMessagesRecents } = require('../repository/messages.js');

const LONGUEUR_MAX = 300;
const DELAI_MIN_MS = 1000;
// joueurId -> moment de son dernier message accepté.
// Par joueur et pas par socket : deux onglets ne doublent pas le débit.
// En mémoire : perdu au redémarrage, ce qui est sans gravité.
const derniersMessages = new Map();

// Calculé à la lecture : le créateur qui écrit en salle d'attente n'a pas encore de couleur,
// ses messages afficheront la bonne une fois la partie commencée.
function roleDans(partie, joueurId) {
  if (joueurId === partie.blanc) return 'blanc';
  if (joueurId === partie.noir) return 'noir';
  if (joueurId === partie.createur) return 'joueur';
  return 'spectateur';
}

function messagePublic(partie, { id, auteur: auteurId, nom, texte, envoye_le }) {
  return { id, auteur: nom, role: roleDans(partie, auteurId), texte, envoyeLe: envoye_le };
}

// joueur vient de socket.data (la session), jamais du message.
function envoyerMessage(partieId, joueur, texte, maintenant = Date.now()) {
  if (!joueur) throw new ErreurApi(401, 'Connectez-vous pour écrire.');

  const partie = trouverPartieParId(partieId);
  if (!partie) throw new ErreurApi(404, 'Partie introuvable.');
  if (partie.statut === 'terminee') {
    throw new ErreurApi(409, 'La partie est terminée : le clavardage est en lecture seule.');
  }

  const propre = typeof texte === 'string' ? texte.trim() : '';
  if (propre === '') throw new ErreurApi(422, 'Le message est vide.');
  if (propre.length > LONGUEUR_MAX) {
    throw new ErreurApi(422, `Le message dépasse ${LONGUEUR_MAX} caractères.`);
  }

  // En dernier : un message refusé pour une autre raison ne consomme pas le délai.
  const dernier = derniersMessages.get(joueur.id) ?? 0;
  if (maintenant - dernier < DELAI_MIN_MS) {
    throw new ErreurApi(429, 'Doucement : un message par seconde au maximum.');
  }
  derniersMessages.set(joueur.id, maintenant);

  const ligne = ajouterMessage(partie.id, joueur.id, propre);
  return messagePublic(partie, { ...ligne, nom: joueur.nom });
}

function historique(partie) {
  return listerMessagesRecents(partie.id).map((m) => messagePublic(partie, m));
}

module.exports = { envoyerMessage, historique, LONGUEUR_MAX };
