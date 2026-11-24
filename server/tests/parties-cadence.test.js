const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { utiliserBaseTemporaire } = require('./helpers/base-temporaire.js');

utiliserBaseTemporaire();

const request = require('supertest');
const app = require('../app.js');
const db = require('../repository/db.js');
const { trouverOuCreerJoueur } = require('../repository/joueurs.js');
const { CADENCES } = require('../services/cadences.js');
const { appConnectee } = require('./helpers/session.js');

const alice = trouverOuCreerJoueur({ githubId: 1, nom: 'alice' });
const bob = trouverOuCreerJoueur({ githubId: 2, nom: 'bob' });

const BLITZ_3_2 = { id: '3+2', categorie: 'blitz', base: 180, increment: 2 };
const RAPIDE_10_0 = { id: '10+0', categorie: 'rapide', base: 600, increment: 0 };

function creer(joueur, corps) {
  return request(appConnectee(app, joueur.id)).post('/api/parties').send(corps);
}

function apercu(joueur, code) {
  return request(appConnectee(app, joueur.id)).get(`/api/parties/code/${encodeURIComponent(code)}`);
}

const nombreDeParties = () => db.prepare('SELECT COUNT(*) AS n FROM parties').get().n;

test('chaque cadence a un id unique, et son id correspond à sa base et à son incrément', () => {
  const ids = CADENCES.map((cadence) => cadence.id);
  assert.equal(new Set(ids).size, ids.length);

  for (const cadence of CADENCES) {
    // « 3+2 » : 3 minutes de base, 2 secondes ajoutées à chaque coup
    const [minutes, secondes] = cadence.id.split('+').map(Number);
    assert.equal(cadence.base, minutes * 60, cadence.id);
    assert.equal(cadence.increment, secondes, cadence.id);
    assert.ok(['bullet', 'blitz', 'rapide'].includes(cadence.categorie), cadence.id);
  }
});

test('GET /api/cadences donne la liste à tout le monde, même sans compte', async () => {
  const reponse = await request(app).get('/api/cadences');

  assert.equal(reponse.status, 200);
  assert.deepEqual(reponse.body, CADENCES);
});

test('POST /api/parties enregistre la cadence choisie et la renvoie complète', async () => {
  const creation = await creer(alice, { cadence: '3+2' });

  assert.equal(creation.status, 201);
  assert.deepEqual(creation.body.cadence, BLITZ_3_2);

  const lecture = await request(appConnectee(app, alice.id)).get(`/api/parties/${creation.body.id}`);
  assert.deepEqual(lecture.body.cadence, BLITZ_3_2);
});

test('POST /api/parties sans cadence crée une partie en 10+0', async () => {
  const creation = await creer(alice, {});

  assert.equal(creation.status, 201);
  assert.deepEqual(creation.body.cadence, RAPIDE_10_0);
});

test('POST /api/parties refuse une cadence inconnue (400) sans créer de partie', async () => {
  for (const cadence of ['7+7', '', 180, { id: '3+2' }]) {
    const avant = nombreDeParties();

    const reponse = await creer(alice, { cadence });

    assert.equal(reponse.status, 400, JSON.stringify(cadence));
    assert.equal(reponse.body.erreur, 'Cadence inconnue.');
    assert.equal(nombreDeParties(), avant, JSON.stringify(cadence));
  }
});

test('GET /api/parties/code/:code montre le créateur et la cadence avant de rejoindre', async () => {
  const { body: partie } = await creer(alice, { cadence: '3+2' });

  const reponse = await apercu(bob, partie.code);

  assert.equal(reponse.status, 200);
  // seulement ce qu'il faut pour décider : ni id interne, ni position, ni code
  assert.deepEqual(reponse.body, { createur: 'alice', cadence: BLITZ_3_2 });
});

test('GET /api/parties/code/:code accepte le code en minuscules, avec des espaces', async () => {
  const { body: partie } = await creer(alice, { cadence: '3+2' });

  const reponse = await apercu(bob, ` ${partie.code.toLowerCase()} `);

  assert.equal(reponse.status, 200);
  assert.deepEqual(reponse.body.cadence, BLITZ_3_2);
});

test('GET /api/parties/code/:code répond 404 pour un code inconnu', async () => {
  const reponse = await apercu(bob, 'ZZZZZZ');

  assert.equal(reponse.status, 404);
});

test('GET /api/parties/code/:code répond 409 pour une partie déjà commencée', async () => {
  const { body: partie } = await creer(alice, {});
  await request(appConnectee(app, bob.id)).post('/api/parties/rejoindre').send({ code: partie.code });

  const reponse = await apercu(bob, partie.code);

  assert.equal(reponse.status, 409);
});

test('GET /api/parties/code/:code sans session répond 401', async () => {
  const { body: partie } = await creer(alice, {});

  const reponse = await request(app).get(`/api/parties/code/${partie.code}`);

  assert.equal(reponse.status, 401);
});

test('une ancienne base sans colonne cadence reçoit la colonne, et ses parties passent en 10+0', () => {
  // Base créée avant #65 : la table parties n'a pas de colonne cadence.
  const chemin = path.join(mkdtempSync(path.join(tmpdir(), 'chess-appweb-ancienne-')), 'ancienne.db');
  const ancienne = new DatabaseSync(chemin);
  ancienne.exec(`
    CREATE TABLE joueurs (id INTEGER PRIMARY KEY, github_id INTEGER UNIQUE, nom TEXT, elo INTEGER DEFAULT 1000);
    CREATE TABLE parties (id INTEGER PRIMARY KEY, code TEXT UNIQUE, createur INTEGER, blanc INTEGER, noir INTEGER,
                          fen TEXT, statut TEXT DEFAULT 'en_attente');
    INSERT INTO parties (code, createur, fen) VALUES ('ANCIEN', 1, 'fen');
  `);
  ancienne.close();

  // db.js s'exécute au chargement : on l'ouvre dans un autre processus, sur cette base.
  const sortie = execFileSync(
    process.execPath,
    ['-e', "console.log(require('./repository/db.js').prepare('SELECT cadence FROM parties').get().cadence)"],
    { cwd: path.join(__dirname, '..'), env: { ...process.env, DATABASE_PATH: chemin }, encoding: 'utf8' },
  );

  assert.equal(sortie.trim(), '10+0');
});
