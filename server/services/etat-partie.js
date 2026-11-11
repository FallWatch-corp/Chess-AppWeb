const { listerCoups } = require('../repository/parties.js');
const { trouverJoueurParId } = require('../repository/joueurs.js');

// L'état complet d'une partie, vu par joueurId (null pour un anonyme ou un spectateur).
// Utilisé par HTTP (GET /api/parties/:id) et par Socket.IO : les deux envoient le même objet.
function etatPartie(partie, joueurId) {
  // couleur reste null tant que l'adversaire n'a pas rejoint, et pour un spectateur
  let couleur = null;
  if (partie.blanc === joueurId) couleur = 'blanc';
  if (partie.noir === joueurId) couleur = 'noir';

  const { id, code, statut, fen } = partie;
  return {
    id,
    code,
    statut,
    couleur,
    fen,
    // dans une FEN, le 2e champ dit qui doit jouer : w (blancs) ou b (noirs)
    trait: fen.split(' ')[1] === 'b' ? 'noir' : 'blanc',
    blanc: joueurPublic(partie.blanc),
    noir: joueurPublic(partie.noir),
    coups: listerCoups(id),
    fin: finPublique(partie),
  };
}

// null tant que la partie n'est pas terminée.
// Les Elo viennent de la partie et pas du joueur : son Elo actuel a pu changer depuis.
function finPublique(partie) {
  if (partie.statut !== 'terminee') return null;
  return {
    resultat: partie.resultat,
    cause: partie.cause,
    eloBlanc: { avant: partie.elo_blanc_avant, apres: partie.elo_blanc_apres },
    eloNoir: { avant: partie.elo_noir_avant, apres: partie.elo_noir_apres },
  };
}

// null tant que personne n'a cette couleur (partie en attente)
function joueurPublic(joueurId) {
  if (joueurId === null) return null;
  const { nom, elo } = trouverJoueurParId(joueurId);
  return { nom, elo };
}

module.exports = { etatPartie };
