const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { utiliserBaseTemporaire } = require('./helpers/base-temporaire.js');

utiliserBaseTemporaire();
console.log = () => {};
process.env.SESSION_SECRET = 'cle-de-session-de-test';
process.env.URL_CLIENT = 'http://client.test';

const request = require('supertest');
const { DEFAULT_POSITION } = require('chess.js');
const app = require('../app.js');
const db = require('../repository/db.js');
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

function partieEnBase(id) {
  const partie = db.prepare('SELECT fen, statut FROM parties WHERE id = ?').get(id);
  const coups = db.prepare('SELECT COUNT(*) AS n FROM coups WHERE partie = ?').get(id).n;
  return { ...partie, coups };
}

const INTACTE = { fen: DEFAULT_POSITION, statut: 'en_cours', coups: 0 };

function envoyer(cookie, chemin, corps) {
  const requete = request(serveur.url).post(chemin);
  if (cookie) requete.set('Cookie', cookie);
  return requete.send(corps);
}

test('HTTP : un anonyme ne peut ni jouer ni abandonner, même en donnant l\'id d\'un joueur', async () => {
  const id = partieEnCours();

  const coup = await envoyer(null, `/api/parties/${id}/coups`, { de: 'e2', vers: 'e4', joueurId: alice.id });
  const abandon = await envoyer(null, `/api/parties/${id}/abandon`, { joueurId: alice.id });

  for (const reponse of [coup, abandon]) {
    assert.equal(reponse.status, 401);
    assert.equal(reponse.body.erreur, 'Vous devez être connecté.');
  }
  assert.deepEqual(partieEnBase(id), INTACTE);
});

test('HTTP : un spectateur connecté ne peut ni jouer ni abandonner, même en se faisant passer pour alice', async () => {
  const id = partieEnCours();
  const cookie = cookiePour(carole.id);

  const coup = await envoyer(cookie, `/api/parties/${id}/coups`, { de: 'e2', vers: 'e4', joueurId: alice.id });
  const abandon = await envoyer(cookie, `/api/parties/${id}/abandon`, { joueurId: bob.id });

  for (const reponse of [coup, abandon]) {
    assert.equal(reponse.status, 403);
    assert.equal(reponse.body.erreur, 'Vous ne participez pas à cette partie.');
  }
  assert.deepEqual(partieEnBase(id), INTACTE);
});

async function emettre(cookie, evenement, message) {
  const socket = connecterSocket(serveur.url, cookie);
  try {
    return await socket.timeout(2000).emitWithAck(evenement, message);
  } finally {
    socket.close();
  }
}

for (const evenement of ['partie:coup', 'partie:abandon']) {
  test(`Socket.IO : ${evenement} d'un anonyme est refusé, même avec l'id d'un joueur`, { timeout: 5000 }, async () => {
    const id = partieEnCours();

    const reponse = await emettre(null, evenement, { partieId: id, de: 'e2', vers: 'e4', joueurId: alice.id });

    assert.deepEqual(reponse, { erreur: 'Vous devez être connecté.' });
    assert.deepEqual(partieEnBase(id), INTACTE);
  });

  test(`Socket.IO : ${evenement} d'un spectateur est refusé, même en se faisant passer pour alice`, { timeout: 5000 }, async () => {
    const id = partieEnCours();

    const reponse = await emettre(cookiePour(carole.id), evenement, { partieId: id, de: 'e2', vers: 'e4', joueurId: alice.id });

    assert.deepEqual(reponse, { erreur: 'Vous ne participez pas à cette partie.' });
    assert.deepEqual(partieEnBase(id), INTACTE);
  });

  test(`Socket.IO : ${evenement} d'un joueur de la partie ne modifie rien, les actions passent par HTTP`, { timeout: 5000 }, async () => {
    const id = partieEnCours();

    const reponse = await emettre(cookiePour(alice.id), evenement, { partieId: id, de: 'e2', vers: 'e4' });

    assert.deepEqual(reponse, { erreur: 'Les coups et l\'abandon se font par HTTP.' });
    assert.deepEqual(partieEnBase(id), INTACTE);
  });
}

test('Socket.IO : une action sur une partie inconnue ou avec un id invalide est refusée', { timeout: 5000 }, async () => {
  const cookie = cookiePour(alice.id);

  assert.deepEqual(await emettre(cookie, 'partie:coup', { partieId: 999999 }), { erreur: 'Partie introuvable.' });
  assert.deepEqual(await emettre(cookie, 'partie:coup', { partieId: '1 OR 1=1' }), { erreur: 'Identifiant invalide.' });
  assert.deepEqual(await emettre(cookie, 'partie:abandon', null), { erreur: 'Identifiant invalide.' });
});
