const { readSession } = require('../session.js');
const { trouverJoueurParId } = require('../repository/joueurs.js');

// Exécuté une seule fois, à l'ouverture de la connexion : c'est le seul moment
// où le cookie de session voyage (dans les en-têtes de la requête HTTP d'ouverture).
// L'identité est ensuite lue dans socket.data, jamais dans le contenu d'un message.
function authentifierSocket(socket, next) {
  const { joueurId } = readSession(socket.request);
  const joueur = joueurId ? trouverJoueurParId(joueurId) : undefined;

  // null = anonyme : il peut regarder une partie, jamais jouer.
  // Pas d'Elo ici : il change en cours de connexion, on le relit en base au besoin.
  socket.data.joueur = joueur ? { id: joueur.id, nom: joueur.nom } : null;
  next();
}

module.exports = { authentifierSocket };
