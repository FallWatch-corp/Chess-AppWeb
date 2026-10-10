const { test } = require('node:test');
const assert = require('node:assert/strict');
const { utiliserBaseTemporaire } = require('./helpers/base-temporaire.js');

utiliserBaseTemporaire();

const request = require('supertest');
const app = require('../app.js');
const db = require('../repository/db.js');
const { trouverOuCreerJoueur } = require('../repository/joueurs.js');
const { creerPartie, rejoindrePartie } = require('../services/parties.js');
const { abandonner } = require('../services/fin-partie.js');
const { appConnectee } = require('./helpers/session.js');

let compteur = 500;

function nouveauJoueur() {
  compteur += 1;
  return trouverOuCreerJoueur({ githubId: compteur, nom: `joueur${compteur}` });
}

// Partie en cours : "blanc" a les blancs
function partieEnCours(blanc, noir) {
  const partie = creerPartie(blanc.id);
  rejoindrePartie(noir.id, partie.code, () => true);
  return partie.id;
}

function historique(joueur) {
  return request(appConnectee(app, joueur.id)).get('/api/parties');
}

test('GET /api/parties sans session répond 401', async () => {
  const reponse = await request(app).get('/api/parties');

  assert.equal(reponse.status, 401);
});

test('l\'historique décrit la partie du point de vue de chaque joueur', async () => {
  const alice = nouveauJoueur();
  const bob = nouveauJoueur();
  const id = partieEnCours(alice, bob);
  abandonner(id, alice.id);

  const pourAlice = await historique(alice);
  const pourBob = await historique(bob);

  assert.equal(pourAlice.status, 200);
  const { date, ...partieAlice } = pourAlice.body[0];
  assert.deepEqual(partieAlice, {
    id,
    adversaire: bob.nom,
    couleur: 'blanc',
    resultat: 'defaite',
    cause: 'abandon',
    eloAvant: 1000,
    eloApres: 990,
  });
  // une date ISO récente, ex. 2026-10-10T21:15:02Z
  assert.ok(Math.abs(Date.now() - new Date(date).getTime()) < 60_000);
  assert.deepEqual(
    { ...pourBob.body[0], date: undefined },
    { ...partieAlice, adversaire: alice.nom, couleur: 'noir', resultat: 'victoire', eloApres: 1010, date: undefined },
  );
});

test('les parties en attente, en cours ou des autres joueurs n\'apparaissent pas', async () => {
  const alice = nouveauJoueur();
  const bob = nouveauJoueur();
  const carole = nouveauJoueur();
  creerPartie(alice.id);
  partieEnCours(alice, bob);
  abandonner(partieEnCours(bob, carole), bob.id);

  const reponse = await historique(alice);

  assert.deepEqual(reponse.body, []);
});

test('les parties sont listées de la plus récente à la plus ancienne', async () => {
  const alice = nouveauJoueur();
  const bob = nouveauJoueur();
  const ancienne = partieEnCours(alice, bob);
  const recente = partieEnCours(bob, alice);
  const memeSeconde = partieEnCours(alice, bob);
  // terminées dans le désordre, puis on vieillit la première pour ne pas dépendre de l'horloge
  abandonner(recente, bob.id);
  abandonner(memeSeconde, bob.id);
  abandonner(ancienne, bob.id);
  db.prepare('UPDATE parties SET terminee_le = \'2020-01-01T00:00:00Z\' WHERE id = ?').run(ancienne);
  db.prepare('UPDATE parties SET terminee_le = \'2026-01-01T00:00:00Z\' WHERE id IN (?, ?)').run(recente, memeSeconde);

  const reponse = await historique(alice);

  // à date égale, la partie créée en dernier passe devant
  assert.deepEqual(reponse.body.map((partie) => partie.id), [memeSeconde, recente, ancienne]);
});

test('une nulle apparaît comme nulle pour les deux joueurs', async () => {
  const alice = nouveauJoueur();
  const bob = nouveauJoueur();
  const id = partieEnCours(alice, bob);
  db.prepare('UPDATE parties SET statut = \'terminee\', resultat = \'nulle\', cause = \'pat\' WHERE id = ?').run(id);

  const pourAlice = await historique(alice);
  const pourBob = await historique(bob);

  assert.equal(pourAlice.body[0].resultat, 'nulle');
  assert.equal(pourBob.body[0].resultat, 'nulle');
  assert.equal(pourBob.body[0].cause, 'pat');
});
