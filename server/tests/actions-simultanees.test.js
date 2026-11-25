const { test } = require('node:test');
const assert = require('node:assert/strict');
const { utiliserBaseTemporaire } = require('./helpers/base-temporaire.js');

utiliserBaseTemporaire();

const request = require('supertest');
const { Chess } = require('chess.js');
const app = require('../app.js');
const db = require('../repository/db.js');
const { trouverOuCreerJoueur, trouverJoueurParId } = require('../repository/joueurs.js');
const { trouverPartieParId, enregistrerCoup, listerCoups } = require('../repository/parties.js');
const { creerPartie, rejoindrePartie } = require('../services/parties.js');
const { terminerPartie } = require('../services/fin-partie.js');
const { appConnectee } = require('./helpers/session.js');

let compteur = 900;
function nouveauJoueur() {
  compteur += 1;
  return trouverOuCreerJoueur({ githubId: compteur, nom: `joueur${compteur}` });
}

function nouvellePartie() {
  const blanc = nouveauJoueur();
  const noir = nouveauJoueur();
  const partie = creerPartie(blanc.id);
  rejoindrePartie(noir.id, partie.code, () => true);
  return { id: partie.id, blanc, noir };
}

function coup(joueur, partieId, corps) {
  return request(appConnectee(app, joueur.id)).post(`/api/parties/${partieId}/coups`).send(corps);
}

function abandon(joueur, partieId) {
  return request(appConnectee(app, joueur.id)).post(`/api/parties/${partieId}/abandon`);
}

function partieEnBase(id) {
  return { ...db.prepare('SELECT statut, resultat, cause FROM parties WHERE id = ?').get(id) };
}

function elos(...joueurs) {
  return joueurs.map((j) => trouverJoueurParId(j.id).elo);
}

async function jusquAuMat({ id, blanc, noir }) {
  await coup(blanc, id, { de: 'f2', vers: 'f3', numero: 0 }).expect(200);
  await coup(noir, id, { de: 'e7', vers: 'e5', numero: 1 }).expect(200);
  await coup(blanc, id, { de: 'g2', vers: 'g4', numero: 2 }).expect(200);
}

function infosMat(partie) {
  const echecs = new Chess(partie.fen);
  const mat = echecs.move({ from: 'd8', to: 'h4' });
  return { id: partie.id, ancienneFen: partie.fen, nouvelleFen: echecs.fen(), coup: mat.san };
}

test('un coup joué sur une position périmée est refusé', async () => {
  const { id, blanc, noir } = nouvellePartie();
  await coup(blanc, id, { de: 'e2', vers: 'e4', numero: 0 }).expect(200);
  await coup(noir, id, { de: 'e7', vers: 'e5', numero: 1 }).expect(200);

  const reponse = await coup(blanc, id, { de: 'd2', vers: 'd4', numero: 0 });

  assert.equal(reponse.status, 409);
  assert.equal(reponse.body.erreur, 'La position a changé, rechargez la partie.');
  assert.deepEqual(listerCoups(id), ['e4', 'e5']);
});

test('un coup joué sur la position à jour est accepté', async () => {
  const { id, blanc, noir } = nouvellePartie();
  await coup(blanc, id, { de: 'e2', vers: 'e4', numero: 0 }).expect(200);
  await coup(noir, id, { de: 'e7', vers: 'e5', numero: 1 }).expect(200);

  await coup(blanc, id, { de: 'd2', vers: 'd4', numero: 2 }).expect(200);

  assert.deepEqual(listerCoups(id), ['e4', 'e5', 'd4']);
});

test('un numéro de coup invalide est refusé', async () => {
  const { id, blanc } = nouvellePartie();
  for (const numero of [-1, 1.5, '0', null]) {
    const reponse = await coup(blanc, id, { de: 'e2', vers: 'e4', numero });
    assert.equal(reponse.status, 400, `numero = ${JSON.stringify(numero)}`);
  }
  assert.deepEqual(listerCoups(id), []);
});

test('deux fois le même coup envoyé en même temps : un seul est joué', async () => {
  const { id, blanc } = nouvellePartie();

  const reponses = await Promise.all([
    coup(blanc, id, { de: 'e2', vers: 'e4', numero: 0 }),
    coup(blanc, id, { de: 'e2', vers: 'e4', numero: 0 }),
  ]);

  assert.deepEqual(reponses.map((r) => r.status).sort(), [200, 409]);
  assert.deepEqual(listerCoups(id), ['e4']);
});

test('deux coups préparés sur la même position : seul le premier est enregistré', () => {
  const { id } = nouvellePartie();
  const lue = trouverPartieParId(id);
  const apres = (de, vers) => new Chess(lue.fen).move({ from: de, to: vers }).after;

  const premier = enregistrerCoup({ id, ancienneFen: lue.fen, nouvelleFen: apres('e2', 'e4'), coup: 'e4' });
  const second = enregistrerCoup({ id, ancienneFen: lue.fen, nouvelleFen: apres('d2', 'd4'), coup: 'd4' });

  assert.equal(premier, true);
  assert.equal(second, false);
  assert.deepEqual(listerCoups(id), ['e4']);
  assert.equal(trouverPartieParId(id).fen, apres('e2', 'e4'));
});

test('un abandon et un mat envoyés en même temps : un seul résultat et une seule mise à jour Elo', async () => {
  const partie = nouvellePartie();
  await jusquAuMat(partie);

  const [mat, abandonBlanc] = await Promise.all([
    coup(partie.noir, partie.id, { de: 'd8', vers: 'h4', numero: 3 }),
    abandon(partie.blanc, partie.id),
  ]);

  assert.deepEqual([mat.status, abandonBlanc.status].sort(), [200, 409]);
  const cause = mat.status === 200 ? 'mat' : 'abandon';
  assert.deepEqual(partieEnBase(partie.id), { statut: 'terminee', resultat: 'noir', cause });
  assert.equal(listerCoups(partie.id).length, cause === 'mat' ? 4 : 3);
  assert.deepEqual(elos(partie.blanc, partie.noir), [990, 1010]);
});

test('abandon puis mat préparés sur la même partie : le mat est ignoré', () => {
  const partie = nouvellePartie();
  for (const [de, vers] of [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4']]) {
    const avant = trouverPartieParId(partie.id);
    const echecs = new Chess(avant.fen);
    const joue = echecs.move({ from: de, to: vers });
    enregistrerCoup({ id: partie.id, ancienneFen: avant.fen, nouvelleFen: echecs.fen(), coup: joue.san });
  }
  const lue = trouverPartieParId(partie.id);

  const abandonEnregistre = terminerPartie(lue, 'noir', 'abandon');
  const matEnregistre = terminerPartie(lue, 'noir', 'mat', infosMat(lue));

  assert.equal(abandonEnregistre, true);
  assert.equal(matEnregistre, false);
  assert.deepEqual(partieEnBase(partie.id), { statut: 'terminee', resultat: 'noir', cause: 'abandon' });
  assert.equal(listerCoups(partie.id).length, 3);
  assert.deepEqual(elos(partie.blanc, partie.noir), [990, 1010]);
});

test('mat puis abandon préparés sur la même partie : l\'abandon est ignoré', async () => {
  const partie = nouvellePartie();
  await jusquAuMat(partie);
  const lue = trouverPartieParId(partie.id);

  const matEnregistre = terminerPartie(lue, 'noir', 'mat', infosMat(lue));
  const abandonEnregistre = terminerPartie(lue, 'blanc', 'abandon');

  assert.equal(matEnregistre, true);
  assert.equal(abandonEnregistre, false);
  assert.deepEqual(partieEnBase(partie.id), { statut: 'terminee', resultat: 'noir', cause: 'mat' });
  assert.deepEqual(listerCoups(partie.id), ['f3', 'e5', 'g4', 'Qh4#']);
  assert.deepEqual(elos(partie.blanc, partie.noir), [990, 1010]);
});
