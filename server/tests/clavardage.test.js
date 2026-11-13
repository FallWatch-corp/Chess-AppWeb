const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { utiliserBaseTemporaire } = require('./helpers/base-temporaire.js');

utiliserBaseTemporaire();
process.env.SESSION_SECRET = 'cle-de-session-de-test';
process.env.URL_CLIENT = 'http://client.test';

const app = require('../app.js');
const { trouverOuCreerJoueur } = require('../repository/joueurs.js');
const { creerPartie, rejoindrePartie } = require('../services/parties.js');
const { abandonner } = require('../services/fin-partie.js');
const { ajouterMessage, listerMessagesRecents } = require('../repository/messages.js');
const { demarrerServeur, cookiePour, connecterSocket, attendre } = require('./helpers/temps-reel.js');

let serveur;
before(async () => { serveur = await demarrerServeur(app); });
after(() => serveur.fermer());

// La limite d'un message par seconde est par personne : chaque test a ses propres joueurs.
let prochainGithubId = 100;
const nouveauJoueur = (nom) => trouverOuCreerJoueur({ githubId: prochainGithubId++, nom });

// blanc crée la partie et joue les blancs, noir rejoint et joue les noirs
function partieEntre(blanc, noir) {
  const partie = creerPartie(blanc.id);
  rejoindrePartie(noir.id, partie.code, () => true);
  return partie.id;
}

// Ouvre un socket (anonyme si joueur est absent), rejoint la partie, renvoie l'historique reçu.
async function entrer(t, partieId, joueur) {
  const socket = connecterSocket(serveur.url, joueur && cookiePour(joueur.id));
  t.after(() => socket.close());
  const historiqueRecu = attendre(socket, 'clavardage:historique');
  await socket.emitWithAck('partie:rejoindre', partieId);
  return { socket, historique: await historiqueRecu };
}

const envoyer = (socket, partieId, texte) =>
  socket.emitWithAck('clavardage:envoyer', { partieId, texte });

test('le message d\'un joueur arrive au spectateur, avec son auteur et son rôle', { timeout: 5000 }, async (t) => {
  const [alice, bob, carole] = ['alice', 'bob', 'carole'].map(nouveauJoueur);
  const id = partieEntre(alice, bob);
  const { socket: socketAlice } = await entrer(t, id, alice);
  const { socket: socketCarole } = await entrer(t, id, carole);

  const recu = attendre(socketCarole, 'clavardage:message');
  const reponse = await envoyer(socketAlice, id, '  Bonne partie !  ');
  const message = await recu;

  assert.deepEqual(reponse, { ok: true });
  assert.equal(message.auteur, 'alice');
  assert.equal(message.role, 'blanc');
  assert.equal(message.texte, 'Bonne partie !');
});

test('l\'auteur reçoit aussi son propre message', { timeout: 5000 }, async (t) => {
  const [alice, bob] = ['alice', 'bob'].map(nouveauJoueur);
  const id = partieEntre(alice, bob);
  const { socket: socketBob } = await entrer(t, id, bob);

  // io.to(salon) et pas socket.to(salon) : l'auteur n'est pas exclu
  const recu = attendre(socketBob, 'clavardage:message');
  await envoyer(socketBob, id, 'Bonjour');

  const message = await recu;
  assert.equal(message.auteur, 'bob');
  assert.equal(message.role, 'noir');
});

test('un spectateur connecté peut écrire, avec le rôle spectateur', { timeout: 5000 }, async (t) => {
  const [alice, bob, carole] = ['alice', 'bob', 'carole'].map(nouveauJoueur);
  const id = partieEntre(alice, bob);
  const { socket: socketAlice } = await entrer(t, id, alice);
  const { socket: socketCarole } = await entrer(t, id, carole);

  const recu = attendre(socketAlice, 'clavardage:message');
  assert.deepEqual(await envoyer(socketCarole, id, 'Joli coup'), { ok: true });

  const message = await recu;
  assert.equal(message.auteur, 'carole');
  assert.equal(message.role, 'spectateur');
});

test('un anonyme lit le clavardage mais ne peut pas écrire', { timeout: 5000 }, async (t) => {
  const [alice, bob] = ['alice', 'bob'].map(nouveauJoueur);
  const id = partieEntre(alice, bob);
  const { socket: socketAlice } = await entrer(t, id, alice);
  await envoyer(socketAlice, id, 'Message public');

  const { socket: socketAnonyme, historique } = await entrer(t, id);

  // il lit
  assert.deepEqual(historique.map((m) => m.texte), ['Message public']);
  // il n'écrit pas
  const reponse = await envoyer(socketAnonyme, id, 'Coucou');
  assert.match(reponse.erreur, /Connectez-vous/);
});

test('un message vide ou trop long est refusé, 300 caractères sont acceptés', { timeout: 5000 }, async (t) => {
  const [alice, bob] = ['alice', 'bob'].map(nouveauJoueur);
  const id = partieEntre(alice, bob);
  const { socket } = await entrer(t, id, alice);

  // Les refus passent avant la limite de débit : ils ne consomment pas la seconde d'attente.
  assert.match((await envoyer(socket, id, '   ')).erreur, /vide/);
  assert.match((await envoyer(socket, id, 42)).erreur, /vide/);
  assert.match((await envoyer(socket, id, 'x'.repeat(301))).erreur, /300 caractères/);
  assert.deepEqual(await envoyer(socket, id, 'x'.repeat(300)), { ok: true });
});

test('un deuxième message dans la même seconde est refusé', { timeout: 5000 }, async (t) => {
  const [alice, bob] = ['alice', 'bob'].map(nouveauJoueur);
  const id = partieEntre(alice, bob);
  const { socket } = await entrer(t, id, alice);

  assert.deepEqual(await envoyer(socket, id, 'Premier'), { ok: true });
  assert.match((await envoyer(socket, id, 'Deuxième')).erreur, /un message par seconde/);
});

test('la limite de débit vaut pour la personne, pas pour l\'onglet', { timeout: 5000 }, async (t) => {
  const [alice, bob] = ['alice', 'bob'].map(nouveauJoueur);
  const id = partieEntre(alice, bob);
  const { socket: onglet1 } = await entrer(t, id, alice);
  const { socket: onglet2 } = await entrer(t, id, alice);

  assert.deepEqual(await envoyer(onglet1, id, 'Depuis le premier onglet'), { ok: true });
  assert.match((await envoyer(onglet2, id, 'Depuis le second onglet')).erreur, /un message par seconde/);
});

test('on ne peut pas écrire dans une partie qu\'on n\'a pas rejointe', { timeout: 5000 }, async (t) => {
  const [alice, bob] = ['alice', 'bob'].map(nouveauJoueur);
  const id = partieEntre(alice, bob);
  // connectée, joueuse de la partie, mais sans partie:rejoindre
  const socket = connecterSocket(serveur.url, cookiePour(alice.id));
  t.after(() => socket.close());

  assert.match((await envoyer(socket, id, 'Bonjour')).erreur, /Rejoignez/);
  // un message mal formé ne fait pas planter le serveur
  assert.equal((await socket.emitWithAck('clavardage:envoyer', null)).erreur, 'Identifiant invalide.');
});

test('l\'identifiant de la partie doit être un entier, même pour qui a rejoint le salon', { timeout: 5000 }, async (t) => {
  const [alice, bob] = ['alice', 'bob'].map(nouveauJoueur);
  const id = partieEntre(alice, bob);
  const { socket } = await entrer(t, id, alice);

  // "12" passerait le test du salon (`partie:12`) : il doit être refusé avant
  assert.equal((await envoyer(socket, String(id), 'Bonjour')).erreur, 'Identifiant invalide.');
  assert.deepEqual(listerMessagesRecents(id), []);
});

test('l\'historique enregistré en base est envoyé à l\'arrivée dans la partie', { timeout: 5000 }, async (t) => {
  const [alice, bob, carole] = ['alice', 'bob', 'carole'].map(nouveauJoueur);
  const id = partieEntre(alice, bob);
  const { socket: socketAlice } = await entrer(t, id, alice);
  await envoyer(socketAlice, id, 'Premier message');
  const { socket: socketBob } = await entrer(t, id, bob);
  await envoyer(socketBob, id, 'Réponse');

  // carole arrive après : elle reçoit les deux, dans l'ordre.
  // Le serveur ne garde rien en mémoire : l'historique est relu en base (il survit donc à un redémarrage).
  const { historique } = await entrer(t, id, carole);

  assert.deepEqual(
    historique.map(({ auteur, role, texte }) => ({ auteur, role, texte })),
    [
      { auteur: 'alice', role: 'blanc', texte: 'Premier message' },
      { auteur: 'bob', role: 'noir', texte: 'Réponse' },
    ],
  );
  assert.ok(historique.every((m) => Number.isInteger(m.id) && m.envoyeLe));
});

test('le créateur qui écrit en salle d\'attente reçoit sa couleur une fois la partie commencée', { timeout: 5000 }, async (t) => {
  const [alice, bob] = ['alice', 'bob'].map(nouveauJoueur);
  const partie = creerPartie(alice.id);
  const { socket: socketAlice } = await entrer(t, partie.id, alice);

  // en attente : pas encore de couleur
  const recu = attendre(socketAlice, 'clavardage:message');
  await envoyer(socketAlice, partie.id, 'Qui veut jouer ?');
  assert.equal((await recu).role, 'joueur');

  // bob rejoint, alice a les blancs : le rôle est recalculé à la lecture
  rejoindrePartie(bob.id, partie.code, () => true);
  const { historique } = await entrer(t, partie.id, bob);
  assert.equal(historique[0].role, 'blanc');
});

test('après la fin de la partie, le clavardage se lit encore mais on ne peut plus écrire', { timeout: 5000 }, async (t) => {
  const [alice, bob] = ['alice', 'bob'].map(nouveauJoueur);
  const id = partieEntre(alice, bob);
  const { socket: socketAlice } = await entrer(t, id, alice);
  await envoyer(socketAlice, id, 'Bonne chance');

  abandonner(id, bob.id);
  const { socket: socketBob, historique } = await entrer(t, id, bob);

  assert.deepEqual(historique.map((m) => m.texte), ['Bonne chance']);
  assert.match((await envoyer(socketBob, id, 'Bien joué')).erreur, /terminée/);
});

test('l\'historique se limite aux 50 messages les plus récents, dans l\'ordre', () => {
  const [alice] = ['alice'].map(nouveauJoueur);
  const partie = creerPartie(alice.id);
  // directement par le repository : on ne teste pas ici la limite de débit
  for (let i = 1; i <= 55; i++) ajouterMessage(partie.id, alice.id, `message ${i}`);

  const textes = listerMessagesRecents(partie.id).map((m) => m.texte);

  assert.equal(textes.length, 50);
  assert.equal(textes[0], 'message 6');
  assert.equal(textes.at(-1), 'message 55');
});
