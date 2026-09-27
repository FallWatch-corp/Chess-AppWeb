const db = require('./db.js');

// Une seule requête : crée le joueur à sa première connexion (Elo 1000 par
// défaut du schéma), sinon réutilise la ligne existante sans toucher à l'Elo.
// Le nom est rafraîchi au cas où le login GitHub aurait changé.
const upsertParGithubId = db.prepare(`
  INSERT INTO joueurs (github_id, nom) VALUES (?, ?)
  ON CONFLICT (github_id) DO UPDATE SET nom = excluded.nom
  RETURNING id, nom, elo
`);

const selectParId = db.prepare('SELECT id, nom, elo FROM joueurs WHERE id = ?');

function trouverOuCreerJoueur({ githubId, nom }) {
  return upsertParGithubId.get(githubId, nom);
}

function trouverJoueurParId(id) {
  return selectParId.get(id);
}

module.exports = { trouverOuCreerJoueur, trouverJoueurParId };
