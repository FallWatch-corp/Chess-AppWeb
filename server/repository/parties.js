const db = require('./db.js');

const insertPartie = db.prepare(`
  INSERT INTO parties (code, createur, fen) VALUES (?, ?, ?)
  RETURNING id, code, statut
`);

const selectParId = db.prepare(`
  SELECT id, code, createur, blanc, noir, fen, statut
  FROM parties WHERE id = ?
`);

// Attention : ça plante (erreur 2067) si le code est deja utilisé.
function insererPartie({ code, createurId, fen }) {
  return insertPartie.get(code, createurId, fen);
}

function trouverPartieParId(id) {
  return selectParId.get(id);
}

module.exports = { insererPartie, trouverPartieParId };
