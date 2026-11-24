const db = require('./db.js');

const insertDelai = db.prepare(`
  INSERT INTO delais_retour (partie, couleur, echeance) VALUES (?, ?, ?)
  ON CONFLICT (partie, couleur) DO NOTHING
`);

const deleteDelai = db.prepare('DELETE FROM delais_retour WHERE partie = ? AND couleur = ?');

const selectDelais = db.prepare('SELECT partie, couleur, echeance FROM delais_retour ORDER BY echeance');

function enregistrerDelai(partieId, couleur, echeance) {
  insertDelai.run(partieId, couleur, echeance);
}

function supprimerDelai(partieId, couleur) {
  deleteDelai.run(partieId, couleur);
}

function listerDelais() {
  return selectDelais.all();
}

module.exports = { enregistrerDelai, supprimerDelai, listerDelais };
