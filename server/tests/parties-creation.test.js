const { test } = require('node:test');
const assert = require('node:assert/strict');
const { utiliserBaseTemporaire } = require('./helpers/base-temporaire.js');

utiliserBaseTemporaire();

const request = require('supertest');
const { DEFAULT_POSITION } = require('chess.js');
const app = require('../app.js');
const { trouverOuCreerJoueur } = require('../repository/joueurs.js');
const { trouverPartieParId } = require('../repository/parties.js');
const { creerPartie, genererCode, ALPHABET, LONGUEUR_CODE } = require('../services/parties.js');
const { appConnectee } = require('./helpers/session.js');

const alice = trouverOuCreerJoueur({ githubId: 1, nom: 'alice' });
const bob = trouverOuCreerJoueur({ githubId: 2, nom: 'bob' });

test('POST /api/parties sans session répond 401', async () => {
  const reponse = await request(app).post('/api/parties');

  assert.equal(reponse.status, 401);
});

test('POST /api/parties crée une partie en attente avec la position initiale', async () => {
  const reponse = await request(appConnectee(app, alice.id)).post('/api/parties');

  assert.equal(reponse.status, 201);
  assert.equal(reponse.body.statut, 'en_attente');
  assert.match(reponse.body.code, new RegExp(`^[${ALPHABET}]{${LONGUEUR_CODE}}$`));

  const enBase = trouverPartieParId(reponse.body.id);
  assert.equal(enBase.createur, alice.id);
  assert.equal(enBase.fen, DEFAULT_POSITION);
  assert.equal(enBase.blanc, null);
  assert.equal(enBase.noir, null);
});

test('deux parties créées reçoivent des codes différents', async () => {
  const connectee = appConnectee(app, alice.id);
  const premiere = await request(connectee).post('/api/parties');
  const seconde = await request(connectee).post('/api/parties');

  assert.notEqual(premiere.body.code, seconde.body.code);
});

test('genererCode produit des codes de 6 caractères sans caractère ambigu', () => {
  for (let i = 0; i < 200; i++) {
    assert.match(genererCode(), /^[A-HJKMNP-Z2-9]{6}$/);
  }
});

test('un code déjà pris est remplacé par un nouveau code', () => {
  const codes = ['DOUBLE', 'DOUBLE', 'UNIQUE'];
  const generer = () => codes.shift();

  const premiere = creerPartie(alice.id, generer);
  const seconde = creerPartie(alice.id, generer);

  assert.equal(premiere.code, 'DOUBLE');
  assert.equal(seconde.code, 'UNIQUE');
});

test('GET /api/parties/:id renvoie la partie à son créateur', async () => {
  const creation = await request(appConnectee(app, alice.id)).post('/api/parties');

  const reponse = await request(appConnectee(app, alice.id)).get(`/api/parties/${creation.body.id}`);

  assert.equal(reponse.status, 200);
  assert.deepEqual(reponse.body, {
    ...creation.body,
    couleur: null,
    fen: DEFAULT_POSITION,
    trait: 'blanc',
    blanc: null,
    noir: null,
    coups: [],
  });
});

test('GET /api/parties/:id répond 403 à un joueur qui ne participe pas', async () => {
  const creation = await request(appConnectee(app, alice.id)).post('/api/parties');

  const reponse = await request(appConnectee(app, bob.id)).get(`/api/parties/${creation.body.id}`);

  assert.equal(reponse.status, 403);
});

test('GET /api/parties/:id répond 404 pour une partie inexistante', async () => {
  const reponse = await request(appConnectee(app, alice.id)).get('/api/parties/999999');

  assert.equal(reponse.status, 404);
});
