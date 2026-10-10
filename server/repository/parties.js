const db = require('./db.js');
const { mettreAJourElo } = require('./joueurs.js');

const insertPartie = db.prepare(`
  INSERT INTO parties (code, createur, fen) VALUES (?, ?, ?)
  RETURNING id, code, statut
`);

const selectParId = db.prepare(`
  SELECT id, code, createur, blanc, noir, fen, statut, resultat, cause,
         elo_blanc_avant, elo_blanc_apres, elo_noir_avant, elo_noir_apres
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

// Le WHERE fen = ? fait comme pour demarrer : si deux coups arrivent en meme temps
// sur la meme position, seulement le premier modifie la ligne.
const updateFen = db.prepare(`
  UPDATE parties SET fen = ?
  WHERE id = ? AND fen = ? AND statut = 'en_cours'
`);

// Pour un abandon, les deux FEN valent null : la position ne change pas
// et on ne vérifie pas qu'elle est restée la même (l'abandon vaut quelle que soit la position).
const updateTerminer = db.prepare(`
  UPDATE parties
  SET fen = COALESCE(?, fen), statut = 'terminee', resultat = ?, cause = ?,
      elo_blanc_avant = ?, elo_blanc_apres = ?,
      elo_noir_avant = ?, elo_noir_apres = ?,
      terminee_le = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
  WHERE id = ? AND fen = COALESCE(?, fen) AND statut = 'en_cours'
`);

// Les parties terminées d'un joueur, de la plus récente à la plus ancienne.
// "id DESC" départage deux parties finies dans la même seconde.
// ponytail: renvoie tout l'historique d'un coup, ajouter LIMIT/OFFSET si un joueur a des centaines de parties
const selectTerminees = db.prepare(`
  SELECT p.id, p.blanc, p.noir, p.resultat, p.cause, p.terminee_le,
         p.elo_blanc_avant, p.elo_blanc_apres, p.elo_noir_avant, p.elo_noir_apres,
         jb.nom AS nom_blanc, jn.nom AS nom_noir
  FROM parties p
  JOIN joueurs jb ON jb.id = p.blanc
  JOIN joueurs jn ON jn.id = p.noir
  WHERE p.statut = 'terminee' AND (p.blanc = ? OR p.noir = ?)
  ORDER BY p.terminee_le DESC, p.id DESC
`);

// ordre = nombre de coups déjà joués + 1
const insertCoup = db.prepare(`
  INSERT INTO coups (partie, ordre, coup)
  VALUES (?, (SELECT COUNT(*) + 1 FROM coups WHERE partie = ?), ?)
`);

const selectCoups = db.prepare('SELECT coup FROM coups WHERE partie = ? ORDER BY ordre');

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

// La nouvelle FEN et le coup sont enregistrés ensemble ou pas du tout.
// Retourne false si la position a changé entre-temps (rien n'est enregistré).
function enregistrerCoup({ id, ancienneFen, nouvelleFen, coup }) {
  db.exec('BEGIN');
  try {
    if (updateFen.run(nouvelleFen, id, ancienneFen).changes !== 1) {
      db.exec('ROLLBACK');
      return false;
    }
    insertCoup.run(id, id, coup);
    db.exec('COMMIT');
    return true;
  } catch (erreur) {
    db.exec('ROLLBACK');
    throw erreur;
  }
}

// Fin de partie : le dernier coup (s'il y en a un), la position, le statut, le résultat,
// la cause et les deux nouveaux Elo sont enregistrés ensemble ou pas du tout.
// resultat : 'blanc', 'noir' ou 'nulle'.
// cause : 'mat', 'abandon', ou pour une nulle 'pat', 'materiel_insuffisant', 'repetition', 'cinquante_coups'.
// Sans coup (abandon), ancienneFen, nouvelleFen et coup sont absents.
// Retourne false si la partie n'était plus en cours (rien n'est enregistré).
function enregistrerFinDePartie({
  id, ancienneFen = null, nouvelleFen = null, coup, resultat, cause,
  blancId, noirId, eloBlancAvant, eloBlancApres, eloNoirAvant, eloNoirApres,
}) {
  db.exec('BEGIN');
  try {
    const modifie = updateTerminer.run(
      nouvelleFen, resultat, cause,
      eloBlancAvant, eloBlancApres, eloNoirAvant, eloNoirApres,
      id, ancienneFen,
    ).changes;
    if (modifie !== 1) {
      db.exec('ROLLBACK');
      return false;
    }
    if (coup) insertCoup.run(id, id, coup);
    mettreAJourElo(blancId, eloBlancApres);
    mettreAJourElo(noirId, eloNoirApres);
    db.exec('COMMIT');
    return true;
  } catch (erreur) {
    db.exec('ROLLBACK');
    throw erreur;
  }
}

function listerPartiesTerminees(joueurId) {
  return selectTerminees.all(joueurId, joueurId);
}

function listerCoups(partieId) {
  return selectCoups.all(partieId).map((ligne) => ligne.coup);
}

module.exports = {
  insererPartie,
  trouverPartieParId,
  trouverPartieParCode,
  demarrerPartie,
  enregistrerCoup,
  enregistrerFinDePartie,
  listerCoups,
  listerPartiesTerminees,
};
