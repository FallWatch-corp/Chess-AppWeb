const { test } = require('node:test');
const assert = require('node:assert/strict');
const { utiliserBaseTemporaire } = require('./helpers/base-temporaire.js');

utiliserBaseTemporaire();

const request = require('supertest');
const app = require('../app.js');
const { trouverOuCreerJoueur } = require('../repository/joueurs.js');
const { creerPartie, rejoindrePartie } = require('../services/parties.js');
const { appConnectee } = require('./helpers/session.js');

let compteur = 700;
function nouveauJoueur() {
  compteur += 1;
  return trouverOuCreerJoueur({ githubId: compteur, nom: `joueur${compteur}` });
}

function enCours(joueur) {
  return request(appConnectee(app, joueur.id)).get('/api/parties/en-cours');
}

test('je vois ma partie en attente et ma partie en cours, pas celles des autres', async () => {
  const alice = nouveauJoueur();
  const bob = nouveauJoueur();
  const carol = nouveauJoueur();
  const enAttente = creerPartie(alice.id);
  const commencee = creerPartie(alice.id);
  rejoindrePartie(bob.id, commencee.code, () => true);
  creerPartie(carol.id);

  const reponse = await enCours(alice);

  assert.equal(reponse.status, 200);
  assert.deepEqual(reponse.body.map((partie) => partie.id), [commencee.id, enAttente.id]);
});

test('GET /api/parties/en-cours sans session répond 401', async () => {
  const reponse = await request(app).get('/api/parties/en-cours');

  assert.equal(reponse.status, 401);
});