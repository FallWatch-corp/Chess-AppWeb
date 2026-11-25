const { setTimeout } = require('node:timers');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { utiliserBaseTemporaire } = require('./helpers/base-temporaire.js');

utiliserBaseTemporaire();
process.env.SESSION_SECRET = 'cle-de-session-de-test';
process.env.URL_CLIENT = 'http://client.test';
process.env.DELAI_RETOUR_MS = '300';

const app = require('../app.js');
const db = require('../repository/db.js');
const { trouverOuCreerJoueur, trouverJoueurParId } = require('../repository/joueurs.js');
const { creerPartie, rejoindrePartie } = require('../services/parties.js');
const { abandonner } = require('../services/fin-partie.js');
const { demarrerServeur, cookiePour, connecterSocket, attendreQue } = require('./helpers/temps-reel.js');

let serveur;
before(async () => { serveur = await demarrerServeur(app); });
after(() => serveur.fermer());

let compteur = 500;
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

function partieEnBase(id) {
  return { ...db.prepare('SELECT statut, resultat, cause FROM parties WHERE id = ?').get(id) };
}

const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function entrer(t, partieId, joueur) {
  const socket = connecterSocket(serveur.url, joueur && cookiePour(joueur.id));
  t.after(() => socket.close());
  await socket.emitWithAck('partie:rejoindre', partieId);
  return socket;
}

test('quand l\'adversaire se déconnecte, le serveur annonce le temps qu\'il lui reste', { timeout: 5000 }, async (t) => {
  const { id, blanc, noir } = nouvellePartie();
  const socketBlanc = await entrer(t, id, blanc);
  const socketNoir = await entrer(t, id, noir);

  const annonce = attendreQue(socketBlanc, 'partie:presence', (p) => p.noir === 'hors_ligne');
  socketNoir.close();
  const presence = await annonce;

  assert.equal(presence.retour.blanc, null);
  assert.ok(presence.retour.noir > 0 && presence.retour.noir <= 300);
});

test('sans retour à temps, le joueur déconnecté perd par abandon et les Elo changent', { timeout: 5000 }, async (t) => {
  const { id, blanc, noir } = nouvellePartie();
  const socketBlanc = await entrer(t, id, blanc);
  const socketNoir = await entrer(t, id, noir);

  const fin = attendreQue(socketBlanc, 'partie:etat', (etat) => etat.statut === 'terminee', 2000);
  socketNoir.close();
  const etat = await fin;

  assert.equal(etat.fin.resultat, 'blanc');
  assert.equal(etat.fin.cause, 'abandon');
  assert.deepEqual(partieEnBase(id), { statut: 'terminee', resultat: 'blanc', cause: 'abandon' });
  assert.equal(trouverJoueurParId(blanc.id).elo, 1010);
  assert.equal(trouverJoueurParId(noir.id).elo, 990);
});

test('un joueur qui revient à temps continue la partie', { timeout: 5000 }, async (t) => {
  const { id, blanc, noir } = nouvellePartie();
  const socketBlanc = await entrer(t, id, blanc);
  const premier = await entrer(t, id, noir);

  const depart = attendreQue(socketBlanc, 'partie:presence', (p) => p.noir === 'hors_ligne');
  premier.close();
  await depart;

  const retour = attendreQue(socketBlanc, 'partie:presence', (p) => p.noir === 'en_ligne');
  await entrer(t, id, noir);
  const presence = await retour;
  assert.equal(presence.retour.noir, null);

  await pause(500);
  assert.equal(partieEnBase(id).statut, 'en_cours');
});

test('un spectateur qui arrive ne relance pas le délai', { timeout: 5000 }, async (t) => {
  const { id, blanc, noir } = nouvellePartie();
  const socketBlanc = await entrer(t, id, blanc);
  const socketNoir = await entrer(t, id, noir);

  const depart = attendreQue(socketBlanc, 'partie:presence', (p) => p.noir === 'hors_ligne');
  socketNoir.close();
  const avant = (await depart).retour.noir;
  await pause(100);

  const arrivee = attendreQue(socketBlanc, 'partie:presence', () => true);
  await entrer(t, id, nouveauJoueur());
  const apres = (await arrivee).retour.noir;

  assert.ok(apres <= avant - 80, `le délai est reparti de ${apres} ms au lieu de continuer depuis ${avant} ms`);
});

test('si les deux joueurs sont déconnectés, le premier dont le délai expire perd', { timeout: 5000 }, async (t) => {
  const { id, blanc, noir } = nouvellePartie();
  const spectateur = await entrer(t, id, null);
  const socketBlanc = await entrer(t, id, blanc);
  const socketNoir = await entrer(t, id, noir);

  const blancParti = attendreQue(spectateur, 'partie:presence', (p) => p.blanc === 'hors_ligne');
  socketBlanc.close();
  await blancParti;
  await pause(100);
  const fin = attendreQue(spectateur, 'partie:etat', (etat) => etat.statut === 'terminee', 2000);
  socketNoir.close();
  const etat = await fin;

  assert.equal(etat.fin.resultat, 'noir');
  assert.equal(etat.fin.cause, 'abandon');
  await pause(400);
  assert.deepEqual(partieEnBase(id), { statut: 'terminee', resultat: 'noir', cause: 'abandon' });
  assert.equal(trouverJoueurParId(blanc.id).elo, 990);
  assert.equal(trouverJoueurParId(noir.id).elo, 1010);
});

test('pas de délai en salle d\'attente', { timeout: 5000 }, async (t) => {
  const createur = nouveauJoueur();
  const partie = creerPartie(createur.id);
  const spectateur = await entrer(t, partie.id, null);
  const socketCreateur = await entrer(t, partie.id, createur);

  const annonce = attendreQue(spectateur, 'partie:presence', (p) => p.blanc === 'hors_ligne' && p.noir === 'hors_ligne');
  socketCreateur.close();
  const presence = await annonce;

  assert.deepEqual(presence.retour, { blanc: null, noir: null });
  await pause(500);
  assert.equal(partieEnBase(partie.id).statut, 'en_attente');
});

test('pas de délai après la fin de la partie', { timeout: 5000 }, async (t) => {
  const { id, blanc, noir } = nouvellePartie();
  abandonner(id, blanc.id);
  const socketBlanc = await entrer(t, id, blanc);
  const socketNoir = await entrer(t, id, noir);

  const annonce = attendreQue(socketBlanc, 'partie:presence', (p) => p.noir === 'hors_ligne');
  socketNoir.close();
  const presence = await annonce;

  assert.deepEqual(presence.retour, { blanc: null, noir: null });
  await pause(500);
  assert.deepEqual(partieEnBase(id), { statut: 'terminee', resultat: 'noir', cause: 'abandon' });
});
