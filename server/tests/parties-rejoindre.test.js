const { test } = require('node:test');
const assert = require('node:assert/strict');
const { utiliserBaseTemporaire } = require('./helpers/base-temporaire.js');

utiliserBaseTemporaire();

const request = require('supertest');
const app = require('../app.js');
const { trouverOuCreerJoueur } = require('../repository/joueurs.js');
const { trouverPartieParId, demarrerPartie } = require('../repository/parties.js');
const { creerPartie, rejoindrePartie } = require('../services/parties.js');
const { appConnectee } = require('./helpers/session.js');
const db = require('../repository/db.js');

const alice = trouverOuCreerJoueur({ githubId: 1, nom: 'alice' });
const bob = trouverOuCreerJoueur({ githubId: 2, nom: 'bob' });
const carole = trouverOuCreerJoueur({ githubId: 3, nom: 'carole' });

function rejoindre(joueur, code) {
  return request(appConnectee(app, joueur.id))
    .post('/api/parties/rejoindre')
    .send({ code });
}

test('POST /api/parties/rejoindre sans session répond 401', async () => {
  const reponse = await request(app).post('/api/parties/rejoindre').send({ code: 'ABCDEF' });

  assert.equal(reponse.status, 401);
});

test('rejoindre avec un bon code démarre la partie', async () => {
  const partie = creerPartie(alice.id);

  const reponse = await rejoindre(bob, partie.code);

  assert.equal(reponse.status, 200);
  assert.equal(reponse.body.id, partie.id);
  assert.ok(['blanc', 'noir'].includes(reponse.body.couleur));

  const enBase = trouverPartieParId(partie.id);
  assert.equal(enBase.statut, 'en_cours');
  assert.deepEqual([enBase.blanc, enBase.noir].sort(), [alice.id, bob.id].sort());
});

test('le code est accepté en minuscules et avec des espaces', async () => {
  const partie = creerPartie(alice.id);

  const reponse = await rejoindre(bob, `  ${partie.code.toLowerCase()} `);

  assert.equal(reponse.status, 200);
});

test('un code inconnu est refusé avec 404', async () => {
  const reponse = await rejoindre(bob, 'ZZZZZZ');

  assert.equal(reponse.status, 404);
  assert.equal(reponse.body.erreur, 'Aucune partie ne correspond à ce code.');
});

test('un code déjà utilisé est refusé avec 409', async () => {
  const partie = creerPartie(alice.id);
  await rejoindre(bob, partie.code);

  const reponse = await rejoindre(carole, partie.code);

  assert.equal(reponse.status, 409);
  assert.equal(reponse.body.erreur, 'Ce code a déjà été utilisé.');
});

test('on ne peut pas rejoindre sa propre partie (403)', async () => {
  const partie = creerPartie(alice.id);

  const reponse = await rejoindre(alice, partie.code);

  assert.equal(reponse.status, 403);
  assert.equal(reponse.body.erreur, 'Vous ne pouvez pas jouer contre vous-même.');
  assert.equal(trouverPartieParId(partie.id).statut, 'en_attente');
});

test('les couleurs sont tirées au sort', () => {
  const premiere = creerPartie(alice.id);
  const seconde = creerPartie(alice.id);

  const createurBlanc = rejoindrePartie(bob.id, premiere.code, () => true);
  const createurNoir = rejoindrePartie(bob.id, seconde.code, () => false);

  assert.equal(createurBlanc.couleur, 'noir');
  assert.equal(trouverPartieParId(premiere.id).blanc, alice.id);
  assert.equal(createurNoir.couleur, 'blanc');
  assert.equal(trouverPartieParId(seconde.id).blanc, bob.id);
});

test('si deux joueurs rejoignent en même temps, un seul réussit', () => {
  const partie = creerPartie(alice.id);

  // on simule les deux requêtes qui arrivent en meme temps :
  // les deux ont vu la partie en attente, puis font leur UPDATE
  const premier = demarrerPartie({ id: partie.id, blancId: alice.id, noirId: bob.id });
  const second = demarrerPartie({ id: partie.id, blancId: carole.id, noirId: alice.id });

  assert.equal(premier, true);
  assert.equal(second, false);
  assert.equal(trouverPartieParId(partie.id).noir, bob.id);
});

test('GET /api/parties/:id donne sa couleur à chaque joueur', async () => {
  const partie = creerPartie(alice.id);
  const { body } = await rejoindre(bob, partie.code);

  const pourBob = await request(appConnectee(app, bob.id)).get(`/api/parties/${partie.id}`);
  const pourAlice = await request(appConnectee(app, alice.id)).get(`/api/parties/${partie.id}`);

  assert.equal(pourBob.body.couleur, body.couleur);
  assert.equal(pourAlice.body.couleur, body.couleur === 'blanc' ? 'noir' : 'blanc');
  assert.equal(pourBob.body.statut, 'en_cours');
});

test('GET /api/parties/:id donne le nom et l\'Elo des deux joueurs', async () => {
  const partie = creerPartie(alice.id);
  rejoindrePartie(bob.id, partie.code, () => true);

  const { body } = await request(appConnectee(app, bob.id)).get(`/api/parties/${partie.id}`);

  assert.deepEqual(body.blanc, { nom: 'alice', elo: 1000 });
  assert.deepEqual(body.noir, { nom: 'bob', elo: 1000 });
});

test('GET /api/parties/:id indique qui a le trait d\'après la FEN', async () => {
  const partie = creerPartie(alice.id);
  rejoindrePartie(bob.id, partie.code);
  const avant = await request(appConnectee(app, alice.id)).get(`/api/parties/${partie.id}`);

  // position après 1. e4 : c'est aux noirs de jouer
  db.prepare('UPDATE parties SET fen = ? WHERE id = ?').run(
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    partie.id,
  );
  const apres = await request(appConnectee(app, alice.id)).get(`/api/parties/${partie.id}`);

  assert.equal(avant.body.trait, 'blanc');
  assert.equal(apres.body.trait, 'noir');
});
