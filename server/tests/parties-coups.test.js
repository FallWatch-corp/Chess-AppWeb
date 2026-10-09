const { test } = require('node:test');
const assert = require('node:assert/strict');
const { utiliserBaseTemporaire } = require('./helpers/base-temporaire.js');

utiliserBaseTemporaire();

const request = require('supertest');
const { Chess, DEFAULT_POSITION } = require('chess.js');
const app = require('../app.js');
const db = require('../repository/db.js');
const { trouverOuCreerJoueur } = require('../repository/joueurs.js');
const { creerPartie, rejoindrePartie } = require('../services/parties.js');
const { appConnectee } = require('./helpers/session.js');

const alice = trouverOuCreerJoueur({ githubId: 1, nom: 'alice' });
const bob = trouverOuCreerJoueur({ githubId: 2, nom: 'bob' });
const carole = trouverOuCreerJoueur({ githubId: 3, nom: 'carole' });

// alice crée et joue les blancs, bob rejoint et joue les noirs
function partieEnCours() {
  const partie = creerPartie(alice.id);
  rejoindrePartie(bob.id, partie.code, () => true);
  return partie.id;
}

function coup(joueur, partieId, corps) {
  return request(appConnectee(app, joueur.id)).post(`/api/parties/${partieId}/coups`).send(corps);
}

function fenEnBase(partieId) {
  return db.prepare('SELECT fen FROM parties WHERE id = ?').get(partieId).fen;
}

function coupsEnBase(partieId) {
  return db.prepare('SELECT ordre, coup FROM coups WHERE partie = ? ORDER BY ordre').all(partieId)
    .map(({ ordre, coup }) => ({ ordre, coup }));
}

const FEN_APRES_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

test('POST /api/parties/:id/coups sans session répond 401', async () => {
  const id = partieEnCours();

  const reponse = await request(app).post(`/api/parties/${id}/coups`).send({ de: 'e2', vers: 'e4' });

  assert.equal(reponse.status, 401);
});

test('un coup légal est enregistré : nouvelle FEN et coup ajouté à la liste', async () => {
  const id = partieEnCours();

  const reponse = await coup(alice, id, { de: 'e2', vers: 'e4' });

  assert.equal(reponse.status, 200);
  assert.equal(reponse.body.fen, FEN_APRES_E4);
  assert.equal(reponse.body.trait, 'noir');
  assert.deepEqual(reponse.body.coups, ['e4']);
  assert.equal(fenEnBase(id), FEN_APRES_E4);
  assert.deepEqual(coupsEnBase(id), [{ ordre: 1, coup: 'e4' }]);
});

test('les coups s\'enchaînent dans l\'ordre et l\'adversaire les voit', async () => {
  const id = partieEnCours();

  await coup(alice, id, { de: 'e2', vers: 'e4' });
  await coup(bob, id, { de: 'c7', vers: 'c5' });
  await coup(alice, id, { de: 'g1', vers: 'f3' });
  const vuParBob = await request(appConnectee(app, bob.id)).get(`/api/parties/${id}`);

  const attendu = new Chess();
  ['e4', 'c5', 'Nf3'].forEach((san) => attendu.move(san));
  assert.equal(vuParBob.body.fen, attendu.fen());
  assert.deepEqual(vuParBob.body.coups, ['e4', 'c5', 'Nf3']);
  assert.deepEqual(coupsEnBase(id).map((c) => c.ordre), [1, 2, 3]);
});

test('un coup hors tour est refusé (409) et rien ne change', async () => {
  const id = partieEnCours();

  const reponse = await coup(bob, id, { de: 'e7', vers: 'e5' });

  assert.equal(reponse.status, 409);
  assert.equal(reponse.body.erreur, 'Ce n\'est pas votre tour.');
  assert.equal(fenEnBase(id), DEFAULT_POSITION);
  assert.deepEqual(coupsEnBase(id), []);
});

test('un coup illégal est refusé (422) et rien ne change', async () => {
  const id = partieEnCours();

  const tropLoin = await coup(alice, id, { de: 'e2', vers: 'e5' });
  const pieceAdverse = await coup(alice, id, { de: 'e7', vers: 'e5' });
  const caseVide = await coup(alice, id, { de: 'e4', vers: 'e5' });

  for (const reponse of [tropLoin, pieceAdverse, caseVide]) {
    assert.equal(reponse.status, 422);
    assert.equal(reponse.body.erreur, 'Coup illégal.');
  }
  assert.equal(fenEnBase(id), DEFAULT_POSITION);
  assert.deepEqual(coupsEnBase(id), []);
});

test('un coup dans une partie terminée est refusé (409)', async () => {
  const id = partieEnCours();
  db.prepare('UPDATE parties SET statut = \'terminee\' WHERE id = ?').run(id);

  const reponse = await coup(alice, id, { de: 'e2', vers: 'e4' });

  assert.equal(reponse.status, 409);
  assert.equal(reponse.body.erreur, 'La partie est terminée.');
});

test('un coup dans une partie encore en attente est refusé (409)', async () => {
  const { id } = creerPartie(alice.id);

  const reponse = await coup(alice, id, { de: 'e2', vers: 'e4' });

  assert.equal(reponse.status, 409);
});

test('un joueur qui ne participe pas reçoit 403, une partie inconnue 404', async () => {
  const id = partieEnCours();

  const intrus = await coup(carole, id, { de: 'e2', vers: 'e4' });
  const inconnue = await coup(alice, 999999, { de: 'e2', vers: 'e4' });

  assert.equal(intrus.status, 403);
  assert.equal(inconnue.status, 404);
  assert.equal(fenEnBase(id), DEFAULT_POSITION);
});

test('un coup mal formé est refusé (400)', async () => {
  const id = partieEnCours();

  const sansArrivee = await coup(alice, id, { de: 'e2' });
  const caseInventee = await coup(alice, id, { de: 'z9', vers: 'e4' });
  const mauvaisePromotion = await coup(alice, id, { de: 'e2', vers: 'e4', promotion: 'k' });

  for (const reponse of [sansArrivee, caseInventee, mauvaisePromotion]) {
    assert.equal(reponse.status, 400);
  }
});

test('promotion : le pion devient la pièce demandée', async () => {
  const id = partieEnCours();
  // le pion blanc h finit par prendre la tour en h8
  const suite = [
    ['h2', 'h4'], ['g7', 'g5'], ['h4', 'g5'], ['h7', 'h6'], ['g5', 'h6'],
    ['f8', 'g7'], ['h6', 'g7'], ['e7', 'e6'],
  ];
  for (const [i, [de, vers]] of suite.entries()) {
    await coup(i % 2 === 0 ? alice : bob, id, { de, vers });
  }

  const reponse = await coup(alice, id, { de: 'g7', vers: 'h8', promotion: 'q' });

  assert.equal(reponse.status, 200);
  assert.match(reponse.body.fen, /^rnbqk1nQ\//);
  assert.equal(reponse.body.coups.at(-1), 'gxh8=Q');
});

test('la FEN et le coup sont dans la même transaction : si l\'ajout du coup échoue, la FEN ne change pas', async () => {
  const id = partieEnCours();
  // 1 coup déjà en base avec l'ordre 2 : le prochain ordre (COUNT + 1 = 2) est déjà pris,
  // donc l'INSERT échoue sur UNIQUE (partie, ordre) après l'UPDATE de la FEN
  db.prepare('INSERT INTO coups (partie, ordre, coup) VALUES (?, 2, \'piège\')').run(id);

  const reponse = await coup(alice, id, { de: 'e2', vers: 'e4' });

  assert.equal(reponse.status, 500);
  assert.equal(fenEnBase(id), DEFAULT_POSITION, 'la FEN aurait dû être annulée avec le coup');
});
