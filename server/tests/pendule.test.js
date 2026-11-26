const { setTimeout } = require('node:timers');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { utiliserBaseTemporaire } = require('./helpers/base-temporaire.js');

utiliserBaseTemporaire();
process.env.SESSION_SECRET = 'cle-de-session-de-test';
process.env.URL_CLIENT = 'http://client.test';
// Délai de retour court, pour tester son interaction avec la pendule sans attendre 60 s.
process.env.DELAI_RETOUR_MS = '300';

const request = require('supertest');
const app = require('../app.js');
const db = require('../repository/db.js');
const { trouverOuCreerJoueur, trouverJoueurParId } = require('../repository/joueurs.js');
const { creerPartie, rejoindrePartie } = require('../services/parties.js');
const { jouerCoup } = require('../services/coups.js');
const { verifierEcheances } = require('../services/echeances.js');
const { penduleAuDepart, penduleApresCoup, penduleRestante } = require('../services/pendule.js');
const { appConnectee } = require('./helpers/session.js');
const { demarrerServeur, cookiePour, connecterSocket, attendreQue } = require('./helpers/temps-reel.js');

let serveur;
before(async () => { serveur = await demarrerServeur(app); });
after(() => serveur.fermer());

const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));
const iso = (ms) => new Date(ms).toISOString();

// Une heure fixe, loin dans le futur : la vérification des échéances (heure réelle) n'y touche jamais.
const T0 = Date.parse('2030-01-01T12:00:00.000Z');
const a = (secondes) => new Date(T0 + secondes * 1000);

const DEPART = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const APRES_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

let compteur = 900;
function nouveauJoueur() {
  compteur += 1;
  return trouverOuCreerJoueur({ githubId: compteur, nom: `joueur${compteur}` });
}

// Le créateur joue les blancs.
function nouvellePartie(cadence = '3+2', blanc = nouveauJoueur(), noir = nouveauJoueur()) {
  const partie = creerPartie(blanc.id, cadence);
  rejoindrePartie(noir.id, partie.code, () => true);
  return { id: partie.id, blanc, noir };
}

function enBase(id) {
  return { ...db.prepare('SELECT * FROM parties WHERE id = ?').get(id) };
}

// Place la pendule à la main : l'échéance (en secondes après T0) et les temps enregistrés (en secondes).
function placer(id, { echeance, blanc, noir, fen }) {
  if (echeance !== undefined) db.prepare('UPDATE parties SET echeance = ? WHERE id = ?').run(iso(a(echeance)), id);
  if (blanc !== undefined) db.prepare('UPDATE parties SET temps_blanc = ? WHERE id = ?').run(blanc * 1000, id);
  if (noir !== undefined) db.prepare('UPDATE parties SET temps_noir = ? WHERE id = ?').run(noir * 1000, id);
  if (fen !== undefined) db.prepare('UPDATE parties SET fen = ? WHERE id = ?').run(fen, id);
}

// --- Les calculs, à heure fixe ---

test('penduleAuDepart : chaque joueur a la base de la cadence, et les blancs ont jusqu\'à maintenant + base', () => {
  assert.deepEqual(penduleAuDepart('3+2', a(0)), { echeance: iso(a(180)), tempsBlanc: 180000, tempsNoir: 180000 });
  assert.deepEqual(penduleAuDepart('1+0', a(0)), { echeance: iso(a(60)), tempsBlanc: 60000, tempsNoir: 60000 });
  // quotidien : une échéance à 24 h, mais pas de pendule
  assert.deepEqual(penduleAuDepart('quotidien', a(0)), { echeance: iso(a(86400)), tempsBlanc: null, tempsNoir: null });
});

test('penduleApresCoup : le joueur garde ce qui lui restait plus l\'incrément, et l\'échéance passe à l\'adversaire', () => {
  // 3+2 : les blancs jouent après 60 s de réflexion, sur 180 s
  const blancsJouent = penduleApresCoup(
    { cadence: '3+2', fen: DEPART, temps_blanc: 180000, temps_noir: 170000, echeance: iso(a(180)) }, a(60),
  );
  assert.deepEqual(blancsJouent, { echeance: iso(a(60 + 170)), tempsBlanc: 122000, tempsNoir: 170000 });

  // puis les noirs, 10 s plus tard
  const noirsJouent = penduleApresCoup(
    { cadence: '3+2', fen: APRES_E4, temps_blanc: 122000, temps_noir: 170000, echeance: iso(a(230)) }, a(70),
  );
  assert.deepEqual(noirsJouent, { echeance: iso(a(70 + 122)), tempsBlanc: 122000, tempsNoir: 162000 });
});

test('penduleApresCoup : sans incrément, le joueur garde juste ce qui lui restait ; en quotidien, 24 h de nouveau', () => {
  const sansIncrement = penduleApresCoup(
    { cadence: '5+0', fen: DEPART, temps_blanc: 300000, temps_noir: 300000, echeance: iso(a(300)) }, a(45),
  );
  assert.deepEqual(sansIncrement, { echeance: iso(a(345)), tempsBlanc: 255000, tempsNoir: 300000 });

  const quotidien = penduleApresCoup(
    { cadence: 'quotidien', fen: DEPART, temps_blanc: null, temps_noir: null, echeance: iso(a(86400)) }, a(1000),
  );
  assert.deepEqual(quotidien, { echeance: iso(a(1000 + 86400)), tempsBlanc: null, tempsNoir: null });
});

test('penduleRestante : seul le temps du joueur au trait s\'écoule, sans descendre sous 0', () => {
  const partie = { statut: 'en_cours', cause: null, temps_blanc: 122000, temps_noir: 170000, echeance: iso(a(180)) };

  assert.deepEqual(penduleRestante({ ...partie, fen: DEPART }, a(60)), { blanc: 120000, noir: 170000 });
  assert.deepEqual(penduleRestante({ ...partie, fen: APRES_E4 }, a(60)), { blanc: 122000, noir: 120000 });
  // échéance passée, pas encore vue par la vérification : 0, pas un temps négatif
  assert.deepEqual(penduleRestante({ ...partie, fen: DEPART }, a(200)), { blanc: 0, noir: 170000 });
});

test('penduleRestante : null en salle d\'attente et en quotidien', () => {
  const sansPendule = { temps_blanc: null, temps_noir: null, fen: DEPART, cause: null };
  assert.equal(penduleRestante({ ...sansPendule, statut: 'en_attente', echeance: null }, a(0)), null);
  assert.equal(penduleRestante({ ...sansPendule, statut: 'en_cours', echeance: iso(a(86400)) }, a(0)), null);
});

test('penduleRestante : figée une fois la partie terminée, à 0 pour celui qui a perdu au temps', () => {
  const finie = { statut: 'terminee', temps_blanc: 122000, temps_noir: 170000, echeance: iso(a(180)) };

  // longtemps après la fin, rien ne bouge
  assert.deepEqual(penduleRestante({ ...finie, cause: 'abandon', fen: DEPART }, a(5000)), { blanc: 122000, noir: 170000 });
  assert.deepEqual(penduleRestante({ ...finie, cause: 'temps', fen: DEPART }, a(5000)), { blanc: 0, noir: 170000 });
  assert.deepEqual(penduleRestante({ ...finie, cause: 'temps', fen: APRES_E4 }, a(5000)), { blanc: 122000, noir: 0 });
});

// --- Dans une vraie partie ---

test('quand l\'adversaire rejoint une 3+2, la pendule démarre : 3 min chacun, celle des blancs tourne', async () => {
  const avant = Date.now();
  const { id, blanc } = nouvellePartie('3+2');
  const apres = Date.now();

  const partie = enBase(id);
  assert.equal(partie.temps_blanc, 180000);
  assert.equal(partie.temps_noir, 180000);
  const echeance = Date.parse(partie.echeance);
  assert.ok(echeance >= avant + 180000 && echeance <= apres + 180000, partie.echeance);

  const { body } = await request(appConnectee(app, blanc.id)).get(`/api/parties/${id}`);
  assert.equal(body.pendule.noir, 180000);
  assert.ok(body.pendule.blanc <= 180000 && body.pendule.blanc > 175000, `blancs : ${body.pendule.blanc}`);
});

test('une partie quotidienne n\'a pas de pendule', async () => {
  const { id, blanc } = nouvellePartie('quotidien');

  const { body } = await request(appConnectee(app, blanc.id)).get(`/api/parties/${id}`);

  assert.equal(body.pendule, null);
  assert.notEqual(body.echeance, null);
});

test('chaque coup enregistre le temps qui restait plus l\'incrément, et passe la pendule à l\'adversaire', () => {
  const { id, blanc, noir } = nouvellePartie('3+2');
  placer(id, { echeance: 180, blanc: 180, noir: 180 });

  jouerCoup(id, blanc.id, { de: 'e2', vers: 'e4' }, a(10));
  let partie = enBase(id);
  assert.deepEqual([partie.temps_blanc, partie.temps_noir, partie.echeance], [172000, 180000, iso(a(10 + 180))]);

  jouerCoup(id, noir.id, { de: 'e7', vers: 'e5' }, a(15));
  partie = enBase(id);
  assert.deepEqual([partie.temps_blanc, partie.temps_noir, partie.echeance], [172000, 177000, iso(a(15 + 172))]);

  // et l'état envoyé au client, 30 s plus tard : seuls les blancs (au trait) ont perdu ces 30 s
  assert.deepEqual(penduleRestante(enBase(id), a(45)), { blanc: 142000, noir: 177000 });
});

test('un coup joué 1 ms avant l\'échéance passe et garde 1 ms plus l\'incrément ; 1 ms après, il est refusé', () => {
  const enRetard = nouvellePartie('3+2');
  placer(enRetard.id, { echeance: 180, blanc: 180, noir: 180 });
  assert.throws(
    () => jouerCoup(enRetard.id, enRetard.blanc.id, { de: 'e2', vers: 'e4' }, new Date(T0 + 180000 + 1)),
    { statut: 409, message: 'Le temps est écoulé.' },
  );
  assert.equal(enBase(enRetard.id).fen, DEPART);

  const juste = nouvellePartie('3+2');
  placer(juste.id, { echeance: 180, blanc: 180, noir: 180 });
  jouerCoup(juste.id, juste.blanc.id, { de: 'e2', vers: 'e4' }, new Date(T0 + 180000 - 1));
  assert.equal(enBase(juste.id).temps_blanc, 1 + 2000);
});

test('un coup qui donne mat enregistre aussi la pendule du joueur qui vient de jouer', () => {
  const { id, blanc, noir } = nouvellePartie('3+2');
  placer(id, { echeance: 180, blanc: 180, noir: 180 });

  // le mat du berger inversé (mat des fous) : 1. f3 e5 2. g4 Dh4#
  jouerCoup(id, blanc.id, { de: 'f2', vers: 'f3' }, a(10)); // blancs : 172 s
  jouerCoup(id, noir.id, { de: 'e7', vers: 'e5' }, a(20)); //  noirs : 172 s
  jouerCoup(id, blanc.id, { de: 'g2', vers: 'g4' }, a(30)); // blancs : 164 s
  jouerCoup(id, noir.id, { de: 'd8', vers: 'h4' }, a(50)); //  noirs : 172 − 20 + 2 = 154 s

  const partie = enBase(id);
  assert.deepEqual([partie.statut, partie.cause, partie.resultat], ['terminee', 'mat', 'noir']);
  assert.deepEqual(penduleRestante(partie, a(5000)), { blanc: 164000, noir: 154000 });
});

test('pendule tombée : le joueur au trait perd au temps, les Elo changent et sa pendule affiche 0', async () => {
  const { id, blanc, noir } = nouvellePartie('3+2');
  db.prepare('UPDATE parties SET echeance = ? WHERE id = ?').run(iso(Date.now() - 1000), id);

  assert.ok(verifierEcheances().includes(id));

  const partie = enBase(id);
  assert.deepEqual([partie.statut, partie.resultat, partie.cause], ['terminee', 'noir', 'temps']);
  assert.equal(trouverJoueurParId(blanc.id).elo, 990);
  assert.equal(trouverJoueurParId(noir.id).elo, 1010);
  const { body } = await request(appConnectee(app, noir.id)).get(`/api/parties/${id}`);
  assert.deepEqual(body.pendule, { blanc: 0, noir: 180000 });
});

test('pendule tombée, mais l\'adversaire n\'a pas de quoi mater : nulle', () => {
  const { id } = nouvellePartie('3+2');
  // les noirs (au trait) ont une dame ; les blancs n'ont que leur roi
  db.prepare('UPDATE parties SET echeance = ?, fen = ? WHERE id = ?')
    .run(iso(Date.now() - 1000), '7k/8/8/8/8/8/8/K5q1 b - - 0 1', id);

  verifierEcheances();

  const partie = enBase(id);
  assert.deepEqual([partie.statut, partie.resultat, partie.cause], ['terminee', 'nulle', 'temps']);
});

test('après un coup, les deux joueurs reçoivent la pendule par Socket.IO', { timeout: 5000 }, async (t) => {
  const { id, blanc, noir } = nouvellePartie('3+2');
  const socket = connecterSocket(serveur.url, cookiePour(noir.id));
  t.after(() => socket.close());
  await socket.emitWithAck('partie:rejoindre', id);

  const recu = attendreQue(socket, 'partie:etat', (etat) => etat.coups.length === 1);
  const reponse = await request(appConnectee(app, blanc.id)).post(`/api/parties/${id}/coups`).send({ de: 'e2', vers: 'e4' });
  assert.equal(reponse.status, 200);
  const { pendule } = await recu;

  // les blancs ont réfléchi quelques ms et gagné 2 s ; la pendule des noirs vient de démarrer
  assert.ok(pendule.blanc > 180000 && pendule.blanc <= 182000, `blancs : ${pendule.blanc}`);
  assert.ok(pendule.noir <= 180000 && pendule.noir > 175000, `noirs : ${pendule.noir}`);
});

test('en revenant sur la partie, un joueur reçoit le temps restant à cet instant, pas celui du dernier coup', { timeout: 5000 }, async (t) => {
  const { id, blanc } = nouvellePartie('3+2');
  // les blancs réfléchissent depuis 130 s : il leur en reste 50
  db.prepare('UPDATE parties SET echeance = ? WHERE id = ?').run(iso(Date.now() + 50000), id);

  const socket = connecterSocket(serveur.url, cookiePour(blanc.id));
  t.after(() => socket.close());
  const etat = attendreQue(socket, 'partie:etat', () => true);
  await socket.emitWithAck('partie:rejoindre', id);
  const { pendule } = await etat;

  assert.equal(pendule.noir, 180000);
  assert.ok(pendule.blanc <= 50000 && pendule.blanc > 45000, `blancs : ${pendule.blanc}`);
});

test('pendule tombée pendant le délai de retour : la partie est perdue au temps, une seule fois', { timeout: 5000 }, async (t) => {
  const { id, blanc, noir } = nouvellePartie('3+2');
  const entrer = async (joueur) => {
    const socket = connecterSocket(serveur.url, cookiePour(joueur.id));
    t.after(() => socket.close());
    await socket.emitWithAck('partie:rejoindre', id);
    return socket;
  };
  const socketBlanc = await entrer(blanc);
  const socketNoir = await entrer(noir);

  // les blancs (au trait) se déconnectent : le délai de retour démarre…
  const depart = attendreQue(socketNoir, 'partie:presence', (p) => p.blanc === 'hors_ligne');
  socketBlanc.close();
  await depart;
  // …mais leur pendule tombe avant la fin du délai
  db.prepare('UPDATE parties SET echeance = ? WHERE id = ?').run(iso(Date.now() - 1), id);
  assert.ok(verifierEcheances().includes(id));

  await pause(600); // deux fois le délai de retour : il expire sur une partie déjà terminée
  const partie = enBase(id);
  assert.deepEqual([partie.resultat, partie.cause], ['noir', 'temps']);
  // les Elo n'ont changé qu'une fois
  assert.equal(trouverJoueurParId(blanc.id).elo, 990);
  assert.equal(trouverJoueurParId(noir.id).elo, 1010);
});

test('la pendule survit à un redémarrage : un nouveau processus termine la partie dont la pendule est tombée', () => {
  const { id } = nouvellePartie('1+0');
  db.prepare('UPDATE parties SET echeance = ? WHERE id = ?').run(iso(Date.now() - 1000), id);

  // comme un serveur qui redémarre : un autre processus, sur la même base, sans rien en mémoire
  const sortie = execFileSync(
    process.execPath,
    ['-e', "console.log(JSON.stringify(require('./services/echeances.js').verifierEcheances()))"],
    { cwd: path.join(__dirname, '..'), env: process.env, encoding: 'utf8' },
  );

  assert.ok(JSON.parse(sortie).includes(id));
  assert.deepEqual([enBase(id).statut, enBase(id).cause], ['terminee', 'temps']);
});
