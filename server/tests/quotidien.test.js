const { setTimeout } = require('node:timers');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { utiliserBaseTemporaire } = require('./helpers/base-temporaire.js');

utiliserBaseTemporaire();
process.env.SESSION_SECRET = 'cle-de-session-de-test';
process.env.URL_CLIENT = 'http://client.test';
// Délai de retour court : s'il s'appliquait aux parties quotidiennes, il expirerait pendant le test.
process.env.DELAI_RETOUR_MS = '300';

const request = require('supertest');
const app = require('../app.js');
const db = require('../repository/db.js');
const { trouverOuCreerJoueur, trouverJoueurParId } = require('../repository/joueurs.js');
const { creerPartie, rejoindrePartie } = require('../services/parties.js');
const { jouerCoup } = require('../services/coups.js');
const { peutMater, verifierEcheances } = require('../services/echeances.js');
const { appConnectee } = require('./helpers/session.js');
const { demarrerServeur, cookiePour, connecterSocket, attendreQue } = require('./helpers/temps-reel.js');

let serveur;
before(async () => { serveur = await demarrerServeur(app); });
after(() => serveur.fermer());

const JOUR = 24 * 60 * 60 * 1000;
const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));

let compteur = 700;
function nouveauJoueur() {
  compteur += 1;
  return trouverOuCreerJoueur({ githubId: compteur, nom: `joueur${compteur}` });
}

// Le créateur joue les blancs.
function nouvellePartie(cadence = 'quotidien', blanc = nouveauJoueur(), noir = nouveauJoueur()) {
  const partie = creerPartie(blanc.id, cadence);
  rejoindrePartie(noir.id, partie.code, () => true);
  return { id: partie.id, blanc, noir };
}

function enBase(id) {
  return { ...db.prepare('SELECT statut, resultat, cause, fen, echeance FROM parties WHERE id = ?').get(id) };
}

// Place l'échéance (et éventuellement la position) à la main, comme si le temps avait passé.
function modifier(id, { echeance, fen }) {
  if (echeance !== undefined) db.prepare('UPDATE parties SET echeance = ? WHERE id = ?').run(echeance, id);
  if (fen !== undefined) db.prepare('UPDATE parties SET fen = ? WHERE id = ?').run(fen, id);
}

const HIER = new Date(Date.now() - JOUR).toISOString();

// L'échéance vaut « maintenant + 24 h », à la durée du test près.
function assertDans24h(echeance, avant, apres) {
  const ms = Date.parse(echeance);
  assert.ok(ms >= avant + JOUR && ms <= apres + JOUR, `échéance ${echeance} hors de [${avant}, ${apres}] + 24 h`);
}

test('peutMater : non avec le roi seul ou avec un seul fou ou cavalier, oui sinon', () => {
  const cas = [
    ['7k/8/8/8/8/8/8/K7 w - - 0 1', 'blanc', false],
    ['7k/8/8/8/8/8/8/KN6 w - - 0 1', 'blanc', false],
    // le fou écrit avant le roi dans la FEN : l'ordre ne compte pas
    ['7k/8/8/8/8/8/1B6/K7 w - - 0 1', 'blanc', false],
    ['7k/8/8/8/8/8/1P6/K7 w - - 0 1', 'blanc', true],
    ['7k/8/8/8/8/8/8/KNN5 w - - 0 1', 'blanc', true],
    ['7k/8/8/8/8/8/8/KQ6 w - - 0 1', 'blanc', true],
    // les pièces de l'autre camp ne comptent pas
    ['6qk/8/8/8/8/8/8/K7 w - - 0 1', 'blanc', false],
    ['6qk/8/8/8/8/8/8/K7 w - - 0 1', 'noir', true],
    ['6nk/8/8/8/8/8/8/KQ6 w - - 0 1', 'noir', false],
  ];
  for (const [fen, couleur, attendu] of cas) {
    assert.equal(peutMater(fen, couleur), attendu, `${couleur} dans ${fen}`);
  }
});

test('en quotidien, l\'échéance est posée à 24 h quand l\'adversaire rejoint, sans pendule', () => {
  const avant = Date.now();
  const { id } = nouvellePartie();
  const apres = Date.now();

  const partie = db.prepare('SELECT echeance, temps_blanc, temps_noir FROM parties WHERE id = ?').get(id);
  assertDans24h(partie.echeance, avant, apres);
  assert.equal(partie.temps_blanc, null);
  assert.equal(partie.temps_noir, null);
});

test('en 3+2, chaque joueur reçoit 3 min quand l\'adversaire rejoint, et les blancs ont jusqu\'à dans 3 min', () => {
  const avant = Date.now();
  const { id } = nouvellePartie('3+2');
  const apres = Date.now();

  const partie = db.prepare('SELECT echeance, temps_blanc, temps_noir FROM parties WHERE id = ?').get(id);
  assert.equal(partie.temps_blanc, 180000);
  assert.equal(partie.temps_noir, 180000);
  const ms = Date.parse(partie.echeance);
  assert.ok(ms >= avant + 180000 && ms <= apres + 180000, partie.echeance);
});

test('l\'échéance est envoyée au client', async () => {
  const { id, blanc } = nouvellePartie();

  const reponse = await request(appConnectee(app, blanc.id)).get(`/api/parties/${id}`);

  assert.equal(reponse.body.echeance, enBase(id).echeance);
  assert.equal(reponse.body.cadence.id, 'quotidien');
});

test('un coup remet le délai à 24 h', async () => {
  const { id, blanc, noir } = nouvellePartie();
  // il ne reste qu'une heure aux blancs
  modifier(id, { echeance: new Date(Date.now() + 60 * 60 * 1000).toISOString() });

  const avant = Date.now();
  const reponse = await request(appConnectee(app, blanc.id)).post(`/api/parties/${id}/coups`).send({ de: 'e2', vers: 'e4' });
  const apres = Date.now();

  assert.equal(reponse.status, 200);
  assertDans24h(enBase(id).echeance, avant, apres);

  // et de nouveau au coup suivant, pour les noirs
  const avantNoir = Date.now();
  await request(appConnectee(app, noir.id)).post(`/api/parties/${id}/coups`).send({ de: 'e7', vers: 'e5' });
  assertDans24h(enBase(id).echeance, avantNoir, Date.now());
});

test('échéance dépassée : le camp au trait perd au temps, et les Elo changent', () => {
  const { id, blanc, noir } = nouvellePartie();
  modifier(id, { echeance: HIER });

  const terminees = verifierEcheances();

  assert.ok(terminees.includes(id));
  const partie = enBase(id);
  assert.deepEqual([partie.statut, partie.resultat, partie.cause], ['terminee', 'noir', 'temps']);
  assert.equal(trouverJoueurParId(blanc.id).elo, 990);
  assert.equal(trouverJoueurParId(noir.id).elo, 1010);
});

test('échéance dépassée avec les noirs au trait : les blancs gagnent', () => {
  const { id } = nouvellePartie();
  modifier(id, { echeance: HIER, fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1' });

  verifierEcheances();

  assert.equal(enBase(id).resultat, 'blanc');
});

test('échéance dépassée, mais l\'adversaire n\'a que son roi : nulle', () => {
  const { id } = nouvellePartie();
  // les blancs (dame) n'ont pas joué ; les noirs n'ont que leur roi
  modifier(id, { echeance: HIER, fen: '7k/8/8/8/8/8/8/KQ6 w - - 0 1' });

  verifierEcheances();

  const partie = enBase(id);
  assert.deepEqual([partie.statut, partie.resultat, partie.cause], ['terminee', 'nulle', 'temps']);
});

test('une échéance pas encore passée, ou une partie en direct, ne sont pas touchées', () => {
  const quotidienne = nouvellePartie();
  const directe = nouvellePartie('10+0');

  const terminees = verifierEcheances();

  assert.ok(!terminees.includes(quotidienne.id));
  assert.ok(!terminees.includes(directe.id));
  assert.equal(enBase(quotidienne.id).statut, 'en_cours');
  assert.equal(enBase(directe.id).statut, 'en_cours');
});

test('une partie déjà terminée au temps n\'est pas terminée une seconde fois', () => {
  const { id } = nouvellePartie();
  modifier(id, { echeance: HIER });

  assert.ok(verifierEcheances().includes(id));
  assert.ok(!verifierEcheances().includes(id));
});

test('un coup joué après l\'échéance est refusé (409), avant même la vérification périodique', async () => {
  const { id, blanc, noir } = nouvellePartie();
  modifier(id, { echeance: HIER });

  const enRetard = await request(appConnectee(app, blanc.id)).post(`/api/parties/${id}/coups`).send({ de: 'e2', vers: 'e4' });
  // l'adversaire, lui, n'est pas en retard : ce n'est simplement pas son tour
  const adversaire = await request(appConnectee(app, noir.id)).post(`/api/parties/${id}/coups`).send({ de: 'e7', vers: 'e5' });

  assert.equal(enRetard.status, 409);
  assert.equal(enRetard.body.erreur, 'Le temps est écoulé.');
  assert.equal(adversaire.body.erreur, 'Ce n\'est pas votre tour.');
  assert.equal(enBase(id).fen.split(' ')[1], 'w');
});

test('jouerCoup compare l\'échéance à l\'heure donnée : juste avant elle, le coup passe', () => {
  const { id, blanc } = nouvellePartie();
  const echeance = new Date(Date.now() + 1000);
  modifier(id, { echeance: echeance.toISOString() });

  assert.throws(
    () => jouerCoup(id, blanc.id, { de: 'e2', vers: 'e4' }, new Date(echeance.getTime() + 1)),
    { message: 'Le temps est écoulé.' },
  );
  jouerCoup(id, blanc.id, { de: 'e2', vers: 'e4' }, new Date(echeance.getTime() - 1));
  assert.equal(enBase(id).fen.split(' ')[1], 'b');
});

test('en quotidien, un joueur déconnecté ne perd pas après le délai de retour', { timeout: 5000 }, async (t) => {
  const { id, blanc, noir } = nouvellePartie();
  const entrer = async (joueur) => {
    const socket = connecterSocket(serveur.url, cookiePour(joueur.id));
    t.after(() => socket.close());
    await socket.emitWithAck('partie:rejoindre', id);
    return socket;
  };
  const socketBlanc = await entrer(blanc);
  const socketNoir = await entrer(noir);

  // la présence reste affichée, mais sans compte à rebours
  const depart = attendreQue(socketBlanc, 'partie:presence', (p) => p.noir === 'hors_ligne');
  socketNoir.close();
  const presence = await depart;
  assert.equal(presence.retour.noir, null);

  await pause(600); // deux fois le délai de retour
  assert.equal(enBase(id).statut, 'en_cours');
});

test('un joueur peut avoir plusieurs parties quotidiennes en même temps, en plus d\'une partie en direct', async () => {
  const alice = nouveauJoueur();
  const bob = nouveauJoueur();
  const carole = nouveauJoueur();
  const premiere = nouvellePartie('quotidien', alice, bob);
  const seconde = nouvellePartie('quotidien', carole, alice);
  const directe = nouvellePartie('5+0', alice, carole);

  // alice joue dans les trois
  for (const [partie, joueur, de, vers] of [[premiere, alice, 'e2', 'e4'], [directe, alice, 'd2', 'd4']]) {
    const reponse = await request(appConnectee(app, joueur.id)).post(`/api/parties/${partie.id}/coups`).send({ de, vers });
    assert.equal(reponse.status, 200);
  }
  await request(appConnectee(app, carole.id)).post(`/api/parties/${seconde.id}/coups`).send({ de: 'e2', vers: 'e4' });
  const reponse = await request(appConnectee(app, alice.id)).post(`/api/parties/${seconde.id}/coups`).send({ de: 'e7', vers: 'e5' });
  assert.equal(reponse.status, 200);

  // seule la partie en retard se termine
  modifier(premiere.id, { echeance: HIER });
  verifierEcheances();
  assert.deepEqual(
    [premiere, seconde, directe].map(({ id }) => enBase(id).statut),
    ['terminee', 'en_cours', 'en_cours'],
  );
});

test('l\'échéance survit à un redémarrage : un nouveau processus termine la partie expirée', () => {
  const { id } = nouvellePartie();
  modifier(id, { echeance: HIER });

  // comme un serveur qui redémarre : un autre processus, sur la même base, sans rien en mémoire
  const sortie = execFileSync(
    process.execPath,
    ['-e', "console.log(JSON.stringify(require('./services/echeances.js').verifierEcheances()))"],
    { cwd: path.join(__dirname, '..'), env: process.env, encoding: 'utf8' },
  );

  assert.ok(JSON.parse(sortie).includes(id));
  assert.equal(enBase(id).statut, 'terminee');
});
