const db = require('./db.js');

const insertPartie = db.prepare(`
  INSERT INTO parties (code, createur, fen) VALUES (?, ?, ?)
  RETURNING id, code, statut
`);

const selectParId = db.prepare(`
  SELECT id, code, createur, blanc, noir, fen, statut
  FROM parties WHERE id = ?
`);

const selectParCode = db.prepare(`
  SELECT id, code, createur, blanc, noir, fen, statut
  FROM parties WHERE code = ?
`);

// Le WHERE statut = 'en_attente' est important : si deux joueurs rejoignent
// en meme temps, seulement le premier va modifier la ligne.
const updateDemarrer = db.prepare(`
  UPDATE parties SET blanc = ?, noir = ?, statut = 'en_cours'
  WHERE id = ? AND statut = 'en_attente'
`);

// Attention : ça plante (erreur 2067) si le code est deja utilisé.
function insererPartie({ code, createurId, fen }) {
  return insertPartie.get(code, createurId, fen);
}

function trouverPartieParId(id) {
  return selectParId.get(id);
}

function trouverPartieParCode(code) {
  return selectParCode.get(code);
}

// Retourne false si la partie n'était plus en attente.
function demarrerPartie({ id, blancId, noirId }) {
  return updateDemarrer.run(blancId, noirId, id).changes === 1;
}

module.exports = { insererPartie, trouverPartieParId, trouverPartieParCode, demarrerPartie };
