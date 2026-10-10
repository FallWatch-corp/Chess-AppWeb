const { trouverPartieParId, enregistrerFinDePartie } = require('../repository/parties.js');
const { trouverJoueurParId } = require('../repository/joueurs.js');
const { nouveauxElo } = require('./elo.js');
const { ErreurApi } = require('./erreur-api.js');

// Calcule les nouveaux Elo et enregistre la fin de partie.
// resultat : 'blanc', 'noir' ou 'nulle'. infosCoup est absent pour un abandon.
// Retourne false si la partie a changé entre-temps (rien n'est enregistré).
function terminerPartie(partie, resultat, cause, infosCoup = {}) {
  const blanc = trouverJoueurParId(partie.blanc);
  const noir = trouverJoueurParId(partie.noir);
  const scoreBlanc = resultat === 'blanc' ? 1 : resultat === 'noir' ? 0 : 0.5;
  const { eloA, eloB } = nouveauxElo(blanc.elo, noir.elo, scoreBlanc);

  return enregistrerFinDePartie({
    ...infosCoup,
    id: partie.id,
    resultat,
    cause,
    blancId: partie.blanc,
    noirId: partie.noir,
    eloBlancAvant: blanc.elo,
    eloBlancApres: eloA,
    eloNoirAvant: noir.elo,
    eloNoirApres: eloB,
  });
}

// On peut abandonner que ce soit son tour ou non : l'adversaire gagne.
function abandonner(partieId, joueurId) {
  const partie = trouverPartieParId(partieId);
  if (!partie) {
    throw new ErreurApi(404, 'Partie introuvable.');
  }
  if (![partie.createur, partie.blanc, partie.noir].includes(joueurId)) {
    throw new ErreurApi(403, 'Vous ne participez pas à cette partie.');
  }
  if (partie.statut === 'terminee') {
    throw new ErreurApi(409, 'La partie est terminée.');
  }
  if (partie.statut !== 'en_cours') {
    throw new ErreurApi(409, 'La partie n\'a pas encore commencé.');
  }

  const resultat = partie.blanc === joueurId ? 'noir' : 'blanc';
  // false = un coup a terminé la partie (mat ou pat) juste avant l'abandon
  if (!terminerPartie(partie, resultat, 'abandon')) {
    throw new ErreurApi(409, 'La partie est terminée.');
  }
}

module.exports = { terminerPartie, abandonner };
