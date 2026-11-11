const { trouverPartieParId } = require('../repository/parties.js');
const { etatPartie } = require('../services/etat-partie.js');

let io = null;

function enregistrerIo(instance) {
  io = instance;
}

// Envoie l'état à jour de la partie à chaque socket de son salon.
async function diffuserPartie(partieId) {
  if (!io) return; // dans les tests HTTP (supertest), il n'y a pas de Socket.IO
  const partie = trouverPartieParId(partieId);
  if (!partie) return;

  const sockets = await io.in(`partie:${partieId}`).fetchSockets();
  for (const s of sockets) {
    s.emit('partie:etat', etatPartie(partie, s.data.joueur?.id ?? null));
  }
}

module.exports = { enregistrerIo, diffuserPartie };
