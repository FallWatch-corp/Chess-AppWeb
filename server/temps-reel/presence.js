const { trouverPartieParId } = require('../repository/parties.js');
const { synchroniserDelais, tempsRestants } = require('./delai-retour.js');
const { diffuserPartie } = require('./diffusion.js');

async function presencePartie(io, partieId) {
  const partie = trouverPartieParId(partieId);
  if (!partie) return null;

  const sockets = await io.in(`partie:${partieId}`).fetchSockets();
  const connectes = new Set(sockets.map((s) => s.data.joueur?.id).filter(Boolean));
  const etat = (joueurId) => (joueurId && connectes.has(joueurId) ? 'en_ligne' : 'hors_ligne');

  const presence = { blanc: etat(partie.blanc), noir: etat(partie.noir) };
  synchroniserDelais(partie, presence, () => diffuserPartie(partieId).catch(console.error));
  return { ...presence, retour: tempsRestants(partieId) };
}

async function diffuserPresence(io, partieId) {
  const presence = await presencePartie(io, partieId);
  if (presence) io.to(`partie:${partieId}`).emit('partie:presence', presence);
}

module.exports = { presencePartie, diffuserPresence };
