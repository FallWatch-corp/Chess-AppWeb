const { setTimeout } = require('node:timers');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { utiliserBaseTemporaire } = require('./helpers/base-temporaire.js');

utiliserBaseTemporaire();
process.env.SESSION_SECRET = 'cle-de-session-de-test';
process.env.URL_CLIENT = 'http://client.test';
process.env.DELAI_RETOUR_MS = '1500';

const db = require('../repository/db.js');
const { trouverOuCreerJoueur, trouverJoueurParId } = require('../repository/joueurs.js');
const { creerPartie, rejoindrePartie } = require('../services/parties.js');
const { cookiePour, connecterSocket, attendreQue } = require('./helpers/temps-reel.js');

async function portLibre() {
  const serveur = net.createServer();
  await new Promise((ok) => serveur.listen(0, ok));
  const port = serveur.address().port;
  await new Promise((ok) => serveur.close(ok));
  return port;
}

async function lancerServeur() {
  const port = await portLibre();
  const url = `http://localhost:${port}`;
  const enfant = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(port), URL_API: url, GITHUB_CLIENT_ID: 'test', GITHUB_CLIENT_SECRET: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let sortie = '';
  enfant.stderr.on('data', (morceau) => { sortie += morceau; });
  await new Promise((ok, echec) => {
    enfant.stdout.on('data', (morceau) => { if (String(morceau).includes('écoute')) ok(); });
    enfant.once('exit', () => echec(new Error(`Le serveur s'est arrêté : ${sortie}`)));
  });
  const arreter = () => new Promise((ok) => {
    if (enfant.exitCode !== null || enfant.signalCode !== null) return ok();
    enfant.once('exit', ok);
    enfant.kill('SIGKILL');
  });
  return { url, arreter };
}

let compteur = 700;
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

function delaisEnBase(id) {
  return db.prepare('SELECT couleur, echeance FROM delais_retour WHERE partie = ?').all(id).map((d) => ({ ...d }));
}

const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function entrer(t, serveur, partieId, joueur) {
  const socket = connecterSocket(serveur.url, cookiePour(joueur.id));
  t.after(() => socket.close());
  await socket.emitWithAck('partie:rejoindre', partieId);
  return socket;
}

async function deconnecterNoirPuisArreter(t, partie) {
  const serveur = await lancerServeur();
  t.after(() => serveur.arreter());
  const socketBlanc = await entrer(t, serveur, partie.id, partie.blanc);
  const socketNoir = await entrer(t, serveur, partie.id, partie.noir);

  const annonce = attendreQue(socketBlanc, 'partie:presence', (p) => p.noir === 'hors_ligne');
  socketNoir.close();
  await annonce;
  socketBlanc.close();
  await serveur.arreter();
}

test('l\'échéance du délai est enregistrée en base', { timeout: 10000 }, async (t) => {
  const partie = nouvellePartie();
  const avant = Date.now();
  await deconnecterNoirPuisArreter(t, partie);

  const delais = delaisEnBase(partie.id);
  assert.equal(delais.length, 1);
  assert.equal(delais[0].couleur, 'noir');
  assert.ok(delais[0].echeance >= avant + 1500 && delais[0].echeance <= Date.now() + 1500);
});

test('après un redémarrage, le délai reprend avec le temps restant puis fait perdre par abandon', { timeout: 10000 }, async (t) => {
  const partie = nouvellePartie();
  await deconnecterNoirPuisArreter(t, partie);
  const { echeance } = delaisEnBase(partie.id)[0];

  const serveur = await lancerServeur();
  t.after(() => serveur.arreter());
  const socketBlanc = connecterSocket(serveur.url, cookiePour(partie.blanc.id));
  t.after(() => socketBlanc.close());
  const annonce = attendreQue(socketBlanc, 'partie:presence', () => true, 2000);
  const fin = attendreQue(socketBlanc, 'partie:etat', (e) => e.statut === 'terminee', 3000);
  await socketBlanc.emitWithAck('partie:rejoindre', partie.id);

  const presence = await annonce;
  assert.equal(presence.noir, 'hors_ligne');
  assert.ok(presence.retour.noir > 0 && presence.retour.noir <= echeance - Date.now() + 50);

  const etat = await fin;
  assert.equal(etat.fin.cause, 'abandon');
  assert.deepEqual(partieEnBase(partie.id), { statut: 'terminee', resultat: 'blanc', cause: 'abandon' });
  assert.deepEqual(delaisEnBase(partie.id), []);
});

test('un délai expiré pendant l\'arrêt termine la partie par abandon au démarrage', { timeout: 10000 }, async (t) => {
  const partie = nouvellePartie();
  await deconnecterNoirPuisArreter(t, partie);
  await pause(1600);

  const serveur = await lancerServeur();
  t.after(() => serveur.arreter());
  for (let essai = 0; essai < 20 && partieEnBase(partie.id).statut === 'en_cours'; essai += 1) {
    await pause(50);
  }

  assert.deepEqual(partieEnBase(partie.id), { statut: 'terminee', resultat: 'blanc', cause: 'abandon' });
  assert.equal(trouverJoueurParId(partie.blanc.id).elo, 1010);
  assert.equal(trouverJoueurParId(partie.noir.id).elo, 990);
  assert.deepEqual(delaisEnBase(partie.id), []);
});

test('un joueur qui revient après le redémarrage, dans le délai, continue la partie', { timeout: 10000 }, async (t) => {
  const partie = nouvellePartie();
  await deconnecterNoirPuisArreter(t, partie);

  const serveur = await lancerServeur();
  t.after(() => serveur.arreter());
  const socketBlanc = await entrer(t, serveur, partie.id, partie.blanc);
  const retour = attendreQue(socketBlanc, 'partie:presence', (p) => p.noir === 'en_ligne', 2000);
  await entrer(t, serveur, partie.id, partie.noir);

  const presence = await retour;
  assert.deepEqual(presence.retour, { blanc: null, noir: null });
  assert.deepEqual(delaisEnBase(partie.id), []);

  await pause(1700);
  assert.equal(partieEnBase(partie.id).statut, 'en_cours');
});
