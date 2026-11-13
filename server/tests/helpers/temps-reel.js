const http = require('node:http');
const { io: connecter } = require('socket.io-client');
const { brancherTempsReel } = require('../../temps-reel/index.js');
const { writeSession } = require('../../session.js');

// Démarre un vrai serveur HTTP + Socket.IO sur un port libre.
// Les console.log du serveur (Connexion…, Déconnexion…) sont coupés : écrits au milieu
// des résultats que node --test relit, ils peuvent les rendre illisibles
// (« Unable to deserialize cloned data ») et faire échouer un fichier dont tous les tests passent.
async function demarrerServeur(app) {
  console.log = () => {};
  const serveurHttp = http.createServer(app);
  const io = brancherTempsReel(serveurHttp);
  await new Promise((ok) => serveurHttp.listen(0, ok));
  const url = `http://localhost:${serveurHttp.address().port}`;
  return { url, fermer: () => new Promise((ok) => io.close(ok)) };
}

// Fabrique un vrai cookie de session signé, avec le code de production.
function cookiePour(joueurId) {
  let cookie;
  writeSession({ cookie: (nom, valeur) => { cookie = `${nom}=${valeur}`; } }, { joueurId });
  return cookie;
}

// Ouvre une connexion comme le ferait un navigateur (avec ou sans cookie).
function connecterSocket(url, cookie) {
  return connecter(url, {
    transports: ['websocket'],
    forceNew: true,
    extraHeaders: cookie ? { cookie } : {},
  });
}

// Attend le prochain événement de ce nom.
function attendre(socket, evenement) {
  return new Promise((ok) => socket.once(evenement, ok));
}

module.exports = { demarrerServeur, cookiePour, connecterSocket, attendre };
