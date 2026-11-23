const db = require('./db.js');

const insertMessage = db.prepare(`
  INSERT INTO messages (partie, auteur, texte) VALUES (?, ?, ?)
  RETURNING id, auteur, texte, envoye_le
`);

// LIMIT garde les plus récents ; on les remet ensuite dans l'ordre chronologique.
const selectRecents = db.prepare(`
  SELECT m.id, m.auteur, j.nom, m.texte, m.envoye_le
  FROM messages m JOIN joueurs j ON j.id = m.auteur
  WHERE m.partie = ?
  ORDER BY m.id DESC
  LIMIT ?
`);

function ajouterMessage(partieId, auteurId, texte) {
  return insertMessage.get(partieId, auteurId, texte);
}

function listerMessagesRecents(partieId, limite = 50) {
  return selectRecents.all(partieId, limite).reverse();
}

module.exports = { ajouterMessage, listerMessagesRecents };
