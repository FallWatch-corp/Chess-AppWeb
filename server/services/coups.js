const { Chess } = require('chess.js');
const { trouverPartieParId, enregistrerCoup, enregistrerCoupFinal } = require('../repository/parties.js');
const { nouveauxElo } = require('./elo.js');
const { ErreurApi } = require('./erreur-api.js');

const CASE = /^[a-h][1-8]$/;
const PROMOTIONS = ['q', 'r', 'b', 'n'];

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

  const echecs = new Chess(partie.fen);
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
  let resultat = null;
  if (echecs.isCheckmate()) {
    resultat = monCamp === 'w' ? 'blanc' : 'noir';
  } else if (echecs.isStalemate()) {
    resultat = 'nulle';
  }

  let enregistre;
  if (resultat === null) {
    enregistre = enregistrerCoup(infosCoup);
  } else {
    const blanc = trouverJoueurParId(partie.blanc);
    const noir = trouverJoueurParId(partie.noir);
    const scoreBlanc = resultat === 'blanc' ? 1 : resultat === 'noir' ? 0 : 0.5;
    const { eloA, eloB } = nouveauxElo(blanc.elo, noir.elo, scoreBlanc);

    enregistre = enregistrerCoupFinal({
      ...infosCoup,
      resultat,
      blancId: partie.blanc,
      noirId: partie.noir,
      eloBlancAvant: blanc.elo,
      eloBlancApres: eloA,
      eloNoirAvant: noir.elo,
      eloNoirApres: eloB,
    });
  }

  if (!enregistre) {
    throw new ErreurApi(409, 'La position a changé, rechargez la partie.');
  }
}

module.exports = { jouerCoup };
