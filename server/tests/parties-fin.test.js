const { test } = require('node:test');
const assert = require('node:assert/strict');
const { utiliserBaseTemporaire } = require('./helpers/base-temporaire.js');

utiliserBaseTemporaire();

const request = require('supertest');
const app = require('../app.js');
const db = require('../repository/db.js');
const { trouverOuCreerJoueur, trouverJoueurParId, mettreAJourElo } = require('../repository/joueurs.js');
const { creerPartie, rejoindrePartie } = require('../services/parties.js');
const { nouveauxElo } = require('../services/elo.js');
const { appConnectee } = require('./helpers/session.js');

let compteur = 100;

// Crée deux nouveaux joueurs et une partie en cours : le premier joue les blancs
function nouvellePartie() {
  compteur += 2;
  const blanc = trouverOuCreerJoueur({ githubId: compteur, nom: `blanc${compteur}` });
  const noir = trouverOuCreerJoueur({ githubId: compteur + 1, nom: `noir${compteur}` });
  const partie = creerPartie(blanc.id);
  rejoindrePartie(noir.id, partie.code, () => true);
  return { id: partie.id, blanc, noir };
}

function jouer(joueur, partieId, de, vers) {
  return request(appConnectee(app, joueur.id))
    .post(`/api/parties/${partieId}/coups`)
    .send({ de, vers });
}

function partieEnBase(partieId) {
  return db.prepare(
    'SELECT statut, resultat, cause, elo_blanc_avant, elo_blanc_apres, elo_noir_avant, elo_noir_apres FROM parties WHERE id = ?',
  ).get(partieId);
}

function mettreFen(partieId, fen) {
  db.prepare('UPDATE parties SET fen = ? WHERE id = ?').run(fen, partieId);
}

// Le mat du berger fou : 1. f3 e5 2. g4 Dh4#
async function jouerMatDuFou({ id, blanc, noir }) {
  await jouer(blanc, id, 'f2', 'f3');
  await jouer(noir, id, 'e7', 'e5');
  await jouer(blanc, id, 'g2', 'g4');
  return jouer(noir, id, 'd8', 'h4');
}

test('un mat termine la partie : le joueur qui mate gagne et les Elo sont mis à jour', async () => {
  const partie = nouvellePartie();

  const reponse = await jouerMatDuFou(partie);

  assert.equal(reponse.status, 200);
  assert.equal(reponse.body.statut, 'terminee');
  const etat = partieEnBase(partie.id);
  assert.equal(etat.statut, 'terminee');
  assert.equal(etat.resultat, 'noir');
  assert.equal(etat.cause, 'mat');
  assert.equal(etat.elo_blanc_avant, 1000);
  assert.equal(etat.elo_noir_avant, 1000);
  assert.equal(etat.elo_blanc_apres, 990);
  assert.equal(etat.elo_noir_apres, 1010);
  assert.equal(trouverJoueurParId(partie.blanc.id).elo, 990);
  assert.equal(trouverJoueurParId(partie.noir.id).elo, 1010);
});

test('un pat termine la partie par une nulle et met à jour les Elo', async () => {
  const partie = nouvellePartie();
  mettreAJourElo(partie.blanc.id, 1200);
  // les blancs jouent Db6 : le roi noir en a8 n'est pas en échec mais n'a aucun coup
  mettreFen(partie.id, 'k7/2K5/8/1Q6/8/8/8/8 w - - 0 1');

  const reponse = await jouer(partie.blanc, partie.id, 'b5', 'b6');

  assert.equal(reponse.status, 200);
  const attendu = nouveauxElo(1200, 1000, 0.5);
  const etat = partieEnBase(partie.id);
  assert.equal(etat.statut, 'terminee');
  assert.equal(etat.resultat, 'nulle');
  assert.equal(etat.cause, 'pat');
  assert.equal(etat.elo_blanc_apres, attendu.eloA);
  assert.equal(etat.elo_noir_apres, attendu.eloB);
  assert.equal(trouverJoueurParId(partie.blanc.id).elo, attendu.eloA);
  assert.equal(trouverJoueurParId(partie.noir.id).elo, attendu.eloB);
});

test('après la fin, tout coup est refusé (409) et les Elo ne bougent plus', async () => {
  const partie = nouvellePartie();
  await jouerMatDuFou(partie);

  const reponse = await jouer(partie.blanc, partie.id, 'a2', 'a3');

  assert.equal(reponse.status, 409);
  assert.equal(reponse.body.erreur, 'La partie est terminée.');
  assert.equal(trouverJoueurParId(partie.blanc.id).elo, 990);
  assert.equal(trouverJoueurParId(partie.noir.id).elo, 1010);
});

test('la fin de partie est une seule transaction : si l\'ajout du coup échoue, rien n\'est enregistré', async () => {
  const partie = nouvellePartie();
  // position où les noirs peuvent mater en un coup (Dh4#)
  mettreFen(partie.id, 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2');
  // 1 coup déjà en base avec l'ordre 2 : le prochain ordre (COUNT + 1 = 2) est déjà pris
  db.prepare('INSERT INTO coups (partie, ordre, coup) VALUES (?, 2, \'piège\')').run(partie.id);

  const reponse = await jouer(partie.noir, partie.id, 'd8', 'h4');

  assert.equal(reponse.status, 500);
  const etat = partieEnBase(partie.id);
  assert.equal(etat.statut, 'en_cours');
  assert.equal(etat.resultat, null);
  assert.equal(trouverJoueurParId(partie.blanc.id).elo, 1000);
  assert.equal(trouverJoueurParId(partie.noir.id).elo, 1000);
});

test('GET /api/parties/:id donne le résultat, la cause et les Elo avant → après aux deux joueurs', async () => {
  const partie = nouvellePartie();

  const enCours = await request(appConnectee(app, partie.blanc.id)).get(`/api/parties/${partie.id}`);
  assert.equal(enCours.body.fin, null);

  await jouerMatDuFou(partie);

  const attendu = {
    resultat: 'noir',
    cause: 'mat',
    eloBlanc: { avant: 1000, apres: 990 },
    eloNoir: { avant: 1000, apres: 1010 },
  };
  for (const joueur of [partie.blanc, partie.noir]) {
    const reponse = await request(appConnectee(app, joueur.id)).get(`/api/parties/${partie.id}`);
    assert.deepEqual(reponse.body.fin, attendu);
  }
});

test('le résultat garde les Elo de la partie même si le classement du joueur change ensuite', async () => {
  const partie = nouvellePartie();
  await jouerMatDuFou(partie);
  mettreAJourElo(partie.noir.id, 1500);

  const reponse = await request(appConnectee(app, partie.noir.id)).get(`/api/parties/${partie.id}`);

  assert.deepEqual(reponse.body.fin.eloNoir, { avant: 1000, apres: 1010 });
});
