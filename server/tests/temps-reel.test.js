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
const { demarrerServeur, cookiePour, connecterSocket, attendre } = require('./helpers/temps-reel.js');

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
// On écoute partie:etat AVANT d'envoyer la demande : le serveur l'envoie juste après sa réponse.
async function rejoindre(socket, partieId) {
  const etatRecu = attendre(socket, 'partie:etat');
  const reponse = await socket.emitWithAck('partie:rejoindre', partieId);
  return { reponse, etat: await etatRecu };
}

test('un joueur connecté rejoint sa partie et reçoit l\'état avec sa couleur', { timeout: 5000 }, async (t) => {
  const id = partieEnCours();
  const socket = connecterSocket(serveur.url, cookiePour(alice.id));
  t.after(() => socket.close());

  const etatRecu = attendre(socket, 'partie:etat');
  const reponse = await socket.emitWithAck('partie:rejoindre', id);
  const etat = await etatRecu;

  assert.deepEqual(reponse, { ok: true });
  assert.equal(etat.id, id);
  assert.equal(etat.couleur, 'blanc');
  assert.equal(etat.statut, 'en_cours');
});

test('un anonyme peut rejoindre une partie, sans couleur', { timeout: 5000 }, async (t) => {
  const id = partieEnCours();
  const socket = connecterSocket(serveur.url);
  t.after(() => socket.close());

  const { reponse, etat } = await rejoindre(socket, id);

  assert.deepEqual(reponse, { ok: true });
  assert.equal(etat.id, id);
  assert.equal(etat.couleur, null);
});

test('un cookie trafiqué donne une connexion anonyme', { timeout: 5000 }, async (t) => {
  const id = partieEnCours();
  // On change un caractère au milieu de la signature : elle ne correspond plus au contenu.
  // (Pas le dernier : en base64, ses 2 derniers bits sont du remplissage, et "x" ou "y"
  // y donnent les mêmes octets. Un test qui comparerait les octets passerait alors pour rien.)
  const cookie = cookiePour(alice.id);
  const i = cookie.length - 10;
  const trafique = cookie.slice(0, i) + (cookie[i] === 'a' ? 'b' : 'a') + cookie.slice(i + 1);
  const socket = connecterSocket(serveur.url, trafique);
  t.after(() => socket.close());

  const { etat } = await rejoindre(socket, id);

  assert.equal(etat.couleur, null);
});

test('rejoindre une partie inexistante renvoie une erreur', { timeout: 5000 }, async (t) => {
  const socket = connecterSocket(serveur.url, cookiePour(alice.id));
  t.after(() => socket.close());

  const reponse = await socket.emitWithAck('partie:rejoindre', 999999);

  assert.deepEqual(reponse, { erreur: 'Partie introuvable.' });
});

test('rejoindre avec un identifiant qui n\'est pas un entier renvoie une erreur', { timeout: 5000 }, async (t) => {
  const socket = connecterSocket(serveur.url, cookiePour(alice.id));
  t.after(() => socket.close());

  const reponse = await socket.emitWithAck('partie:rejoindre', '1 OR 1=1');

  assert.deepEqual(reponse, { erreur: 'Identifiant invalide.' });
});

test('le coup joué par alice en HTTP arrive à bob par Socket.IO', { timeout: 5000 }, async (t) => {
  const id = partieEnCours();
  const socketBob = connecterSocket(serveur.url, cookiePour(bob.id));
  t.after(() => socketBob.close());
  // bob doit être dans le salon (premier état reçu) avant qu'alice joue
  await rejoindre(socketBob, id);

  const etatApresCoup = attendre(socketBob, 'partie:etat');
  await request(serveur.url)
    .post(`/api/parties/${id}/coups`)
    .set('Cookie', cookiePour(alice.id))
    .send({ de: 'e2', vers: 'e4' })
    .expect(200);
  const etat = await etatApresCoup;

  assert.deepEqual(etat.coups, ['e4']);
  assert.equal(etat.trait, 'noir');
  // l'état est calculé pour bob : il garde sa couleur
  assert.equal(etat.couleur, 'noir');
});

test('alice attend dans la salle d\'attente et reçoit l\'arrivée de bob par Socket.IO', { timeout: 5000 }, async (t) => {
  const partie = creerPartie(alice.id);
  const socketAlice = connecterSocket(serveur.url, cookiePour(alice.id));
  t.after(() => socketAlice.close());
  const { etat: enAttente } = await rejoindre(socketAlice, partie.id);
  assert.equal(enAttente.statut, 'en_attente');

  const etatApresArrivee = attendre(socketAlice, 'partie:etat');
  await request(serveur.url)
    .post('/api/parties/rejoindre')
    .set('Cookie', cookiePour(bob.id))
    .send({ code: partie.code })
    .expect(200);
  const etat = await etatApresArrivee;

  assert.equal(etat.statut, 'en_cours');
  assert.ok(['blanc', 'noir'].includes(etat.couleur));
  assert.equal(etat[etat.couleur].nom, 'alice');
  assert.equal(etat[etat.couleur === 'blanc' ? 'noir' : 'blanc'].nom, 'bob');
});
