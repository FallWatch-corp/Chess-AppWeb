const { Chess } = require('chess.js');
const { trouverPartieParId, enregistrerCoup, listerCoups } = require('../repository/parties.js');
const { terminerPartie } = require('./fin-partie.js');
const { ErreurApi } = require('./erreur-api.js');

const CASE = /^[a-h][1-8]$/;
const PROMOTIONS = ['q', 'r', 'b', 'n'];

// La FEN ne dit pas combien de fois une position est déjà arrivée : pour détecter
// la répétition, chess.js a besoin de l'historique, donc on rejoue les coups en base.
// La FEN en base reste la référence : si les coups ne mènent pas à cette position,
// on repart de la FEN seule (la répétition ne sera alors pas détectée).
function chargerPosition(partie) {
  const echecs = new Chess();
  try {
    for (const coup of listerCoups(partie.id)) echecs.move(coup);
  } catch {
    // coup illisible : la comparaison juste en dessous nous ramène à la FEN
  }
  return echecs.fen() === partie.fen ? echecs : new Chess(partie.fen);
}

// Les causes de nulle, dans l'ordre où on les teste.
function causeDeNulle(echecs) {
  if (echecs.isStalemate()) return 'pat';
  if (echecs.isInsufficientMaterial()) return 'materiel_insuffisant';
  if (echecs.isThreefoldRepetition()) return 'repetition';
  if (echecs.isDrawByFiftyMoves()) return 'cinquante_coups';
  return null;
}

// Le serveur est l'arbitre : on repart toujours de la FEN en base,
// jamais de ce que le client croit voir.
function jouerCoup(partieId, joueurId, { de, vers, promotion } = {}) {
  const partie = trouverPartieParId(partieId);
  if (!partie) {
    throw new ErreurApi(404, 'Partie introuvable.');
  }
  // le créateur compte aussi : avant que l'adversaire rejoigne, il n'a pas encore de couleur
  if (![partie.createur, partie.blanc, partie.noir].includes(joueurId)) {
    throw new ErreurApi(403, 'Vous ne participez pas à cette partie.');
  }
  if (partie.statut === 'terminee') {
    throw new ErreurApi(409, 'La partie est terminée.');
  }
  if (partie.statut !== 'en_cours') {
    throw new ErreurApi(409, 'La partie n\'a pas encore commencé.');
  }
  if (!CASE.test(de ?? '') || !CASE.test(vers ?? '') || (promotion !== undefined && !PROMOTIONS.includes(promotion))) {
    throw new ErreurApi(400, 'Coup mal formé : il faut une case de départ et une case d\'arrivée (ex. e2, e4).');
  }

  const echecs = chargerPosition(partie);
  const monCamp = partie.blanc === joueurId ? 'w' : 'b';
  if (echecs.turn() !== monCamp) {
    throw new ErreurApi(409, 'Ce n\'est pas votre tour.');
  }

  // chess.js lance une exception si le coup est illégal
  let coup;
  try {
    coup = echecs.move({ from: de, to: vers, promotion });
  } catch {
    throw new ErreurApi(422, 'Coup illégal.');
  }

  const infosCoup = {
    id: partie.id,
    ancienneFen: partie.fen,
    nouvelleFen: echecs.fen(),
    coup: coup.san,
  };

  // Après le coup, chess.js dit si la partie est finie.
  // Le joueur qui vient de jouer (monCamp) gagne s'il y a mat.
  // Le mat passe avant les nulles : un mat au 50e coup reste un mat.
  const nulle = causeDeNulle(echecs);
  let enregistre;
  if (echecs.isCheckmate()) {
    enregistre = terminerPartie(partie, monCamp === 'w' ? 'blanc' : 'noir', 'mat', infosCoup);
  } else if (nulle) {
    enregistre = terminerPartie(partie, 'nulle', nulle, infosCoup);
  } else {
    enregistre = enregistrerCoup(infosCoup);
  }

  if (!enregistre) {
    throw new ErreurApi(409, 'La position a changé, rechargez la partie.');
  }
}

module.exports = { jouerCoup };
