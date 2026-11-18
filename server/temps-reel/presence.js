const { trouverPartieParId } = require('../repository/parties.js');

async function presencePartie(io, partieId) {
  const partie = trouverPartieParId(partieId);
  if (!partie) return null;

  const sockets = await io.in(`partie:${partieId}`).fetchSockets();
  const connectes = new Set(sockets.map((s) => s.data.joueur?.id).filter(Boolean));
  const etat = (joueurId) => (joueurId && connectes.has(joueurId) ? 'en_ligne' : 'hors_ligne');

  return { blanc: etat(partie.blanc), noir: etat(partie.noir) };
}

async function diffuserPresence(io, partieId) {
  const presence = await presencePartie(io, partieId);
  if (presence) io.to(`partie:${partieId}`).emit('partie:presence', presence);
}

module.exports = { presencePartie, diffuserPresence };
