const { setTimeout } = require('node:timers');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { utiliserBaseTemporaire } = require('./helpers/base-temporaire.js');

utiliserBaseTemporaire();
console.log = () => {};
process.env.SESSION_SECRET = 'cle-de-session-de-test';
process.env.URL_CLIENT = 'http://client.test';

const app = require('../app.js');
const { trouverOuCreerJoueur } = require('../repository/joueurs.js');
const { creerPartie, rejoindrePartie } = require('../services/parties.js');
const { demarrerServeur, cookiePour, connecterSocket } = require('./helpers/temps-reel.js');

const alice = trouverOuCreerJoueur({ githubId: 1, nom: 'alice' });
const bob = trouverOuCreerJoueur({ githubId: 2, nom: 'bob' });
const carole = trouverOuCreerJoueur({ githubId: 3, nom: 'carole' });

let serveur;
before(async () => { serveur = await demarrerServeur(app); });
after(() => serveur.fermer());

function partieEnCours() {
  const partie = creerPartie(alice.id);
  rejoindrePartie(bob.id, partie.code, () => true);
  return partie.id;
}

function ouvrir(t, joueur) {
  const socket = connecterSocket(serveur.url, joueur && cookiePour(joueur.id));
  t.after(() => socket.close());
  socket.presences = [];
  socket.on('partie:presence', (presence) => socket.presences.push(presence));
  return socket;
}

async function presenceNumero(socket, numero) {
  const debut = Date.now();
  while (socket.presences.length < numero) {
    if (Date.now() - debut > 2000) throw new Error(`présence n°${numero} jamais reçue`);
    await new Promise((ok) => setTimeout(ok, 10));
  }
  const { blanc, noir } = socket.presences[numero - 1];
  return { blanc, noir };
}

test('en arrivant, on reçoit la présence des deux joueurs', { timeout: 5000 }, async (t) => {
  const id = partieEnCours();
  const socketAlice = ouvrir(t, alice);

  await socketAlice.emitWithAck('partie:rejoindre', id);

  assert.deepEqual(await presenceNumero(socketAlice, 1), { blanc: 'en_ligne', noir: 'hors_ligne' });
});

test('quand l\'adversaire arrive, il est annoncé en ligne', { timeout: 5000 }, async (t) => {
  const id = partieEnCours();
  const socketAlice = ouvrir(t, alice);
  await socketAlice.emitWithAck('partie:rejoindre', id);
  await presenceNumero(socketAlice, 1);

  const socketBob = ouvrir(t, bob);
  await socketBob.emitWithAck('partie:rejoindre', id);

  assert.deepEqual(await presenceNumero(socketAlice, 2), { blanc: 'en_ligne', noir: 'en_ligne' });
  assert.deepEqual(await presenceNumero(socketBob, 1), { blanc: 'en_ligne', noir: 'en_ligne' });
});

test('un spectateur ou un anonyme ne rend personne en ligne', { timeout: 5000 }, async (t) => {
  const id = partieEnCours();
  const socketCarole = ouvrir(t, carole);
  const socketAnonyme = ouvrir(t, null);

  await socketCarole.emitWithAck('partie:rejoindre', id);
  await socketAnonyme.emitWithAck('partie:rejoindre', id);

  assert.deepEqual(await presenceNumero(socketCarole, 2), { blanc: 'hors_ligne', noir: 'hors_ligne' });
});

test('deux onglets : bob reste en ligne tant qu\'un onglet est ouvert', { timeout: 5000 }, async (t) => {
  const id = partieEnCours();
  const socketAlice = ouvrir(t, alice);
  await socketAlice.emitWithAck('partie:rejoindre', id);
  const onglet1 = ouvrir(t, bob);
  await onglet1.emitWithAck('partie:rejoindre', id);
  const onglet2 = ouvrir(t, bob);
  await onglet2.emitWithAck('partie:rejoindre', id);
  await presenceNumero(socketAlice, 3);

  onglet1.close();
  assert.deepEqual(await presenceNumero(socketAlice, 4), { blanc: 'en_ligne', noir: 'en_ligne' });

  onglet2.close();
  assert.deepEqual(await presenceNumero(socketAlice, 5), { blanc: 'en_ligne', noir: 'hors_ligne' });
});

test('en salle d\'attente, la couleur sans joueur est hors ligne', { timeout: 5000 }, async (t) => {
  const partie = creerPartie(alice.id);
  const socketAlice = ouvrir(t, alice);

  await socketAlice.emitWithAck('partie:rejoindre', partie.id);

  assert.deepEqual(await presenceNumero(socketAlice, 1), { blanc: 'hors_ligne', noir: 'hors_ligne' });
});

async function spectateursNumero(socket, numero) {
  await presenceNumero(socket, numero);
  return socket.presences[numero - 1].spectateurs;
}

test('les joueurs ne comptent pas comme spectateurs', { timeout: 5000 }, async (t) => {
  const id = partieEnCours();
  const socketAlice = ouvrir(t, alice);
  await socketAlice.emitWithAck('partie:rejoindre', id);
  const socketBob = ouvrir(t, bob);
  await socketBob.emitWithAck('partie:rejoindre', id);

  assert.equal(await spectateursNumero(socketAlice, 2), 0);
});

test('le nombre de spectateurs suit les arrivées et les départs', { timeout: 5000 }, async (t) => {
  const id = partieEnCours();
  const socketAlice = ouvrir(t, alice);
  await socketAlice.emitWithAck('partie:rejoindre', id);
  const socketCarole = ouvrir(t, carole);
  await socketCarole.emitWithAck('partie:rejoindre', id);
  const socketAnonyme = ouvrir(t, null);
  await socketAnonyme.emitWithAck('partie:rejoindre', id);
  assert.equal(await spectateursNumero(socketAlice, 3), 2);

  socketCarole.close();
  assert.equal(await spectateursNumero(socketAlice, 4), 1);
});

test('deux onglets : un spectateur connecté compte une fois, un anonyme une fois par onglet', { timeout: 5000 }, async (t) => {
  const id = partieEnCours();
  const socketAlice = ouvrir(t, alice);
  await socketAlice.emitWithAck('partie:rejoindre', id);
  for (const joueur of [carole, carole, null, null]) {
    await ouvrir(t, joueur).emitWithAck('partie:rejoindre', id);
  }

  assert.equal(await spectateursNumero(socketAlice, 5), 3);
});

test('en salle d\'attente, le créateur ne compte pas mais un anonyme oui', { timeout: 5000 }, async (t) => {
  const partie = creerPartie(alice.id);
  const socketAlice = ouvrir(t, alice);
  await socketAlice.emitWithAck('partie:rejoindre', partie.id);
  await ouvrir(t, null).emitWithAck('partie:rejoindre', partie.id);

  assert.equal(await spectateursNumero(socketAlice, 2), 1);
});
