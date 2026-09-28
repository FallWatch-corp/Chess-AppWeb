const { trouverJoueurParId } = require('../repository/joueurs.js');

// joueurId est mis dans la session après la connexion GitHub.
// On va chercher le joueur dans la base à chaque fois pour avoir le bon Elo.
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
