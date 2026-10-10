const db = require('./db.js');

// Si le joueur n'existe pas on le crée (elo 1000 par défaut dans le schéma).
// S'il existe deja on garde son elo et on met juste son nom a jour.
const upsertParGithubId = db.prepare(`
  INSERT INTO joueurs (github_id, nom) VALUES (?, ?)
  ON CONFLICT (github_id) DO UPDATE SET nom = excluded.nom
  RETURNING id, nom, elo
`);

const selectParId = db.prepare('SELECT id, nom, elo FROM joueurs WHERE id = ?');
const updateElo = db.prepare('UPDATE joueurs SET elo = ? WHERE id = ?');

function trouverOuCreerJoueur({ githubId, nom }) {
  return upsertParGithubId.get(githubId, nom);
}

function trouverJoueurParId(id) {
  return selectParId.get(id);
}

function mettreAJourElo(id, elo) {
  updateElo.run(elo, id);
}

module.exports = { trouverOuCreerJoueur, trouverJoueurParId, mettreAJourElo };
