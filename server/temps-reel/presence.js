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
  return { ...presence, retour: tempsRestants(partieId), spectateurs: compterSpectateurs(partie, sockets) };
}

// Les joueurs (créateur compris, en salle d'attente) ne comptent pas.
// Un spectateur connecté compte une fois, même avec plusieurs onglets (on le reconnaît à son id) ;
// un anonyme compte une fois par onglet : rien ne permet de savoir que deux onglets sont à la même personne.
function compterSpectateurs(partie, sockets) {
  const joueurs = [partie.createur, partie.blanc, partie.noir];
  const spectateurs = new Set();
  for (const s of sockets) {
    const id = s.data.joueur?.id;
    // Un anonyme n'a pas d'id : sans ce test, en salle d'attente (noir vaut null), il passerait pour un joueur.
    if (!id) spectateurs.add(s.id);
    else if (!joueurs.includes(id)) spectateurs.add(id);
  }
  return spectateurs.size;
}

async function diffuserPresence(io, partieId) {
  const presence = await presencePartie(io, partieId);
  if (presence) io.to(`partie:${partieId}`).emit('partie:presence', presence);
}

module.exports = { presencePartie, diffuserPresence };
