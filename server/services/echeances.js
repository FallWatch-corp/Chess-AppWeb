const { trouverPartieParId, listerPartiesEnRetard } = require('../repository/parties.js');
const { terminerPartie } = require('./fin-partie.js');

// Peut-on mater avec ces pièces ? Non avec le roi seul, ou le roi et un seul fou ou cavalier.
function peutMater(fen, couleur) {
  const pieces = fen.split(' ')[0].replace(/[^a-zA-Z]/g, ''); // seulement les lettres
  const miennes = [...pieces].filter((p) => (couleur === 'blanc' ? p === p.toUpperCase() : p === p.toLowerCase()));
  const sansRoi = miennes.filter((p) => p.toLowerCase() !== 'k');
  if (sansRoi.length === 0) return false;
  if (sansRoi.length === 1 && ['b', 'n'].includes(sansRoi[0].toLowerCase())) return false;
  return true;
}

// Termine au temps chaque partie quotidienne dont l'échéance est passée.
// Renvoie les ids terminés, pour que le serveur prévienne les joueurs.
function verifierEcheances(maintenant = new Date()) {
  const terminees = [];

  for (const { id } of listerPartiesEnRetard(maintenant.toISOString())) {
    const partie = trouverPartieParId(id);

    // Le camp au trait (2e champ de la FEN : "w" ou "b") n'a pas joué à temps : il perd.
    const perdant = partie.fen.split(' ')[1] === 'w' ? 'blanc' : 'noir';
    const gagnant = perdant === 'blanc' ? 'noir' : 'blanc';
    // ... sauf si le gagnant n'a pas de quoi mater : c'est alors nulle.
    const resultat = peutMater(partie.fen, gagnant) ? gagnant : 'nulle';

    // false si la partie n'est plus en cours (déjà terminée autrement) : on ne la compte pas.
    // Pas de coup possible entre la lecture et l'écriture : la fonction ne contient aucun await.
    if (terminerPartie(partie, resultat, 'temps')) {
      terminees.push(id);
    }
  }

  return terminees;
}

module.exports = { peutMater, verifierEcheances };
