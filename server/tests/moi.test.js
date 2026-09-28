const { test } = require('node:test');
const assert = require('node:assert/strict');
const { utiliserBaseTemporaire } = require('./helpers/base-temporaire.js');

utiliserBaseTemporaire();

const request = require('supertest');
const app = require('../app.js');
const db = require('../repository/db.js');
const { trouverOuCreerJoueur } = require('../repository/joueurs.js');
const { appConnectee } = require('./helpers/session.js');

test('la première connexion crée un joueur avec un Elo de 1000', () => {
  const joueur = trouverOuCreerJoueur({ githubId: 101, nom: 'alice' });

  assert.equal(joueur.nom, 'alice');
  assert.equal(joueur.elo, 1000);
});

test('une connexion suivante réutilise le profil sans doublon et conserve l\'Elo', () => {
  const premier = trouverOuCreerJoueur({ githubId: 202, nom: 'bob' });
  db.prepare('UPDATE joueurs SET elo = 1234 WHERE id = ?').run(premier.id);

  const second = trouverOuCreerJoueur({ githubId: 202, nom: 'bob' });

  assert.equal(second.id, premier.id);
  assert.equal(second.elo, 1234);
  const { total } = db.prepare('SELECT COUNT(*) AS total FROM joueurs WHERE github_id = 202').get();
  assert.equal(total, 1);
});

test('GET /api/moi sans session répond 401', async () => {
  const reponse = await request(app).get('/api/moi');

  assert.equal(reponse.status, 401);
});

test('GET /api/moi avec une session vers un joueur inexistant répond 401', async () => {
  const reponse = await request(appConnectee(app, 999999)).get('/api/moi');

  assert.equal(reponse.status, 401);
});

test('GET /api/moi connecté renvoie mon nom et mon Elo', async () => {
  const joueur = trouverOuCreerJoueur({ githubId: 303, nom: 'carole' });

  const reponse = await request(appConnectee(app, joueur.id)).get('/api/moi');

  assert.equal(reponse.status, 200);
  assert.deepEqual(reponse.body, { nom: 'carole', elo: 1000 });
});
