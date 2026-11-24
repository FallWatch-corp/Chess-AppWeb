const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { utiliserBaseTemporaire } = require('./helpers/base-temporaire.js');

utiliserBaseTemporaire();
process.env.SESSION_SECRET = 'cle-de-session-de-test';
process.env.URL_CLIENT = 'http://client.test';

const request = require('supertest');
const app = require('../app.js');
const { trouverOuCreerJoueur } = require('../repository/joueurs.js');
const { creerPartie, rejoindrePartie } = require('../services/parties.js');
const { demarrerServeur, cookiePour, connecterSocket, attendre, attendreQue } = require('./helpers/temps-reel.js');

const alice = trouverOuCreerJoueur({ githubId: 1, nom: 'alice' });
const bob = trouverOuCreerJoueur({ githubId: 2, nom: 'bob' });

let serveur;
before(async () => { serveur = await demarrerServeur(app); });
after(() => serveur.fermer());

// alice crée et joue les blancs, bob rejoint et joue les noirs
function partieEnCours() {
  const partie = creerPartie(alice.id);
  rejoindrePartie(bob.id, partie.code, () => true);
  return partie.id;
}

// Rejoint la partie et renvoie la réponse du serveur et le premier état reçu.
async function rejoindre(socket, partieId) {
  const etatRecu = attendre(socket, 'partie:etat');
  const reponse = await socket.emitWithAck('partie:rejoindre', partieId);
  return { reponse, etat: await etatRecu };
}

test('bob revient après une coupure et reçoit le coup joué pendant son absence', { timeout: 5000 }, async (t) => {
  const id = partieEnCours();

  // 1. bob ouvre une connexion et rejoint la partie
  const premier = connecterSocket(serveur.url, cookiePour(bob.id));
  t.after(() => premier.close());
  await rejoindre(premier, id);

  // 2. bob perd sa connexion
  premier.close();

  // 3. pendant son absence, alice joue e2 → e4 par HTTP
  await request(serveur.url)
    .post(`/api/parties/${id}/coups`)
    .set('Cookie', cookiePour(alice.id))
    .send({ de: 'e2', vers: 'e4' })
    .expect(200);

  // 4. bob revient : une NOUVELLE connexion, qui rejoint la partie
  const retour = connecterSocket(serveur.url, cookiePour(bob.id));
  t.after(() => retour.close());
  const { etat } = await rejoindre(retour, id);

  // 5. l'état reçu au retour contient le coup manqué
  assert.deepEqual(etat.coups, ['e4']);
  assert.equal(etat.trait, 'noir');
  assert.equal(etat.couleur, 'noir');
});

test('alice voit bob repasser en ligne après une coupure', { timeout: 5000 }, async (t) => {
  const id = partieEnCours();

  // 1. alice et bob rejoignent la partie
  const premier = connecterSocket(serveur.url, cookiePour(bob.id));
  t.after(() => premier.close());
  await rejoindre(premier, id);
  const socketAlice = connecterSocket(serveur.url, cookiePour(alice.id));
  t.after(() => socketAlice.close());
  await rejoindre(socketAlice, id);

  // 2. bob perd sa connexion : alice le voit hors ligne
  const horsLigne = attendreQue(socketAlice, 'partie:presence', (presence) => presence.noir === 'hors_ligne');
  premier.close();
  await horsLigne;

  // 3. bob revient : alice le voit de nouveau en ligne
  const enLigne = attendreQue(socketAlice, 'partie:presence', (presence) => presence.noir === 'en_ligne');
  const retour = connecterSocket(serveur.url, cookiePour(bob.id));
  t.after(() => retour.close());
  await rejoindre(retour, id);
  
  
  // 4. l'annonce dit que les deux joueurs sont en ligne
  const presence = await enLigne;
  assert.deepEqual(presence, { blanc: 'en_ligne', noir: 'en_ligne' });
});

// Limite : le serveur est arrêté puis relancé dans le même programme Node.
// Ce test prouve qu'un nouveau serveur retrouve la partie, pas qu'elle survit
// à un vrai redémarrage du programme, où toute la mémoire est effacée.
// À garder en dernier dans ce fichier : chaque demarrerServeur remplace le io
// utilisé pour les diffusions, donc le serveur du before() n'en reçoit plus ensuite.
test('un nouveau serveur retrouve la partie en cours après un arrêt', { timeout: 5000 }, async (t) => {
  const id = partieEnCours();

  // 1. un premier serveur démarre, et alice y joue e2 → e4 par HTTP
  const avant = await demarrerServeur(app);
  t.after(() => avant.fermer());
  await request(avant.url)
    .post(`/api/parties/${id}/coups`)
    .set('Cookie', cookiePour(alice.id))
    .send({ de: 'e2', vers: 'e4' })
    .expect(200);

  // 2. ce serveur s'arrête, puis un nouveau démarre
  await avant.fermer();
  const apres = await demarrerServeur(app);
  t.after(() => apres.fermer());

  // 3. bob se connecte au NOUVEAU serveur et rejoint la partie
  const socketBob = connecterSocket(apres.url, cookiePour(bob.id));
  t.after(() => socketBob.close());
  const { etat } = await rejoindre(socketBob, id);

  // 4. la partie est toujours là, avec le coup joué avant l'arrêt
  assert.equal(etat.statut, 'en_cours');
  assert.deepEqual(etat.coups, ['e4']);
});
