const { trouverJoueurParId } = require('../repository/joueurs.js');

// Le callback OAuth (#9) place l'id du joueur dans req.session.joueurId.
// On relit le joueur en base à chaque requête : l'Elo affiché est toujours à jour.
function exigerConnexion(req, res, next) {
  const joueurId = req.session?.joueurId;
  const joueur = joueurId ? trouverJoueurParId(joueurId) : undefined;

  if (!joueur) {
    return res.status(401).json({ erreur: 'Vous devez être connecté.' });
  }

  req.joueur = joueur;
  next();
}

module.exports = { exigerConnexion };
