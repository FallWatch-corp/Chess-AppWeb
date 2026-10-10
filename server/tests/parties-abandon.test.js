const { test } = require('node:test');
const assert = require('node:assert/strict');
const { utiliserBaseTemporaire } = require('./helpers/base-temporaire.js');

utiliserBaseTemporaire();

const request = require('supertest');
const app = require('../app.js');
const db = require('../repository/db.js');
const { trouverOuCreerJoueur, trouverJoueurParId } = require('../repository/joueurs.js');
const { creerPartie, rejoindrePartie } = require('../services/parties.js');
const { appConnectee } = require('./helpers/session.js');

let compteur = 300;

function nouveauJoueur() {
  compteur += 1;
  return trouverOuCreerJoueur({ githubId: compteur, nom: `joueur${compteur}` });
}

// Partie en cours : le premier joueur a les blancs
function nouvellePartie() {
  const blanc = nouveauJoueur();
  const noir = nouveauJoueur();
  const partie = creerPartie(blanc.id);
  rejoindrePartie(noir.id, partie.code, () => true);
  return { id: partie.id, blanc, noir };
}

function abandonner(joueur, partieId) {
  return request(appConnectee(app, joueur.id)).post(`/api/parties/${partieId}/abandon`);
}

function partieEnBase(partieId) {
  return db.prepare('SELECT statut, resultat, cause FROM parties WHERE id = ?').get(partieId);
}

test('abandonner fait perdre le joueur et gagner l\'adversaire, les deux Elo sont mis à jour', async () => {
  const { id, blanc, noir } = nouvellePartie();

  const reponse = await abandonner(blanc, id);

  assert.equal(reponse.status, 200);
  assert.equal(reponse.body.statut, 'terminee');
  assert.deepEqual({ ...partieEnBase(id) }, { statut: 'terminee', resultat: 'noir', cause: 'abandon' });
  assert.equal(trouverJoueurParId(blanc.id).elo, 990);
  assert.equal(trouverJoueurParId(noir.id).elo, 1010);
});

test('on peut abandonner même quand ce n\'est pas son tour', async () => {
  const { id, noir } = nouvellePartie();

  const reponse = await abandonner(noir, id);

  assert.equal(reponse.status, 200);
  assert.equal(partieEnBase(id).resultat, 'blanc');
});

test('l\'adversaire voit l\'abandon en redemandant la partie', async () => {
  const { id, blanc, noir } = nouvellePartie();
  await abandonner(blanc, id);

  const vuParNoir = await request(appConnectee(app, noir.id)).get(`/api/parties/${id}`);

  assert.equal(vuParNoir.body.statut, 'terminee');
});

test('abandonner une partie déjà terminée répond 409 et ne change plus les Elo', async () => {
  const { id, blanc, noir } = nouvellePartie();
  await abandonner(blanc, id);

  const reponse = await abandonner(noir, id);

  assert.equal(reponse.status, 409);
  assert.equal(reponse.body.erreur, 'La partie est terminée.');
  assert.equal(trouverJoueurParId(blanc.id).elo, 990);
  assert.equal(trouverJoueurParId(noir.id).elo, 1010);
});

test('abandonner une partie qui n\'a pas commencé répond 409', async () => {
  const createur = nouveauJoueur();
  const { id } = creerPartie(createur.id);

  const reponse = await abandonner(createur, id);

  assert.equal(reponse.status, 409);
  assert.equal(partieEnBase(id).statut, 'en_attente');
});

test('un joueur qui ne participe pas reçoit 403', async () => {
  const { id } = nouvellePartie();

  const reponse = await abandonner(nouveauJoueur(), id);

  assert.equal(reponse.status, 403);
  assert.equal(partieEnBase(id).statut, 'en_cours');
});

test('abandonner sans session répond 401', async () => {
  const { id } = nouvellePartie();

  const reponse = await request(app).post(`/api/parties/${id}/abandon`);

  assert.equal(reponse.status, 401);
});

test('après un abandon, la partie indique la cause « abandon » et le gagnant', async () => {
  const { id, blanc, noir } = nouvellePartie();
  await abandonner(blanc, id);

  const reponse = await request(appConnectee(app, noir.id)).get(`/api/parties/${id}`);

  assert.equal(reponse.body.fin.resultat, 'noir');
  assert.equal(reponse.body.fin.cause, 'abandon');
});
