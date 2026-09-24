const { test } = require('node:test');
const assert = require('node:assert/strict');
const { utiliserBaseTemporaire } = require('./helpers/base-temporaire.js');

// Doit s'exécuter avant le require('../app.js') : repository/db.js ouvre
// la base et crée les tables dès son chargement, en lisant DATABASE_PATH.
utiliserBaseTemporaire();

const request = require('supertest');
const app = require('../app.js');

test('GET /api/health répond 200', async () => {
  const reponse = await request(app).get('/api/health');

  assert.equal(reponse.status, 200);
  assert.deepEqual(reponse.body, { statut: 'ok' });
});
