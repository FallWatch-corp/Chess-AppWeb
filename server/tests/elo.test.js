const { test } = require('node:test');
const assert = require('node:assert/strict');
const { attendu, nouvelElo, nouveauxElo } = require('../services/elo.js');

test('à Elo égal, le résultat attendu est 0,5', () => {
  assert.equal(attendu(1000, 1000), 0.5);
});

test('1000 contre 1000 : victoire → 1010, nulle → 1000, défaite → 990', () => {
  assert.equal(nouvelElo(1000, 1000, 1), 1010);
  assert.equal(nouvelElo(1000, 1000, 0.5), 1000);
  assert.equal(nouvelElo(1000, 1000, 0), 990);
});

test('le résultat est arrondi à l\'entier le plus proche', () => {
  // calculé a la main : 1204,8 donc arrondi a 1205
  assert.equal(nouvelElo(1200, 1000, 1), 1205);
  // et 995,19 donc arrondi a 995
  assert.equal(nouvelElo(1000, 1200, 0), 995);
});

test('un joueur à 100 qui perd reste à 100', () => {
  assert.equal(nouvelElo(100, 100, 0), 100);
});

test('un joueur à 3000 qui gagne reste à 3000', () => {
  assert.equal(nouvelElo(3000, 3000, 1), 3000);
});

test('nouveauxElo met à jour les deux joueurs à partir des Elo d\'avant la partie', () => {
  assert.deepEqual(nouveauxElo(1000, 1000, 1), { eloA: 1010, eloB: 990 });
  assert.deepEqual(nouveauxElo(1200, 1000, 0.5), { eloA: 1195, eloB: 1005 });
});

test('un score autre que 0, 0,5 ou 1 est refusé', () => {
  assert.throws(() => nouvelElo(1000, 1000, 2), RangeError);
});
