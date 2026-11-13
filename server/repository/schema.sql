CREATE TABLE IF NOT EXISTS joueurs (
  id         INTEGER PRIMARY KEY,
  github_id  INTEGER NOT NULL UNIQUE,
  nom        TEXT NOT NULL,
  elo        INTEGER NOT NULL DEFAULT 1000 CHECK (elo BETWEEN 100 AND 3000)
);

CREATE TABLE IF NOT EXISTS parties (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  code              TEXT NOT NULL UNIQUE,
  createur          INTEGER NOT NULL REFERENCES joueurs(id),
  blanc             INTEGER REFERENCES joueurs(id),
  noir              INTEGER REFERENCES joueurs(id),
  fen               TEXT NOT NULL,
  statut            TEXT NOT NULL DEFAULT 'en_attente'
                    CHECK (statut IN ('en_attente', 'en_cours', 'terminee')),
  resultat          TEXT,
  cause             TEXT,
  elo_blanc_avant   INTEGER,
  elo_blanc_apres   INTEGER,
  elo_noir_avant    INTEGER,
  elo_noir_apres    INTEGER,
  terminee_le       TEXT
);

CREATE TABLE IF NOT EXISTS coups (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  partie     INTEGER NOT NULL REFERENCES parties(id),
  ordre      INTEGER NOT NULL,
  coup       TEXT NOT NULL,
  UNIQUE (partie, ordre)
);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  partie     INTEGER NOT NULL REFERENCES parties(id),
  auteur     INTEGER NOT NULL REFERENCES joueurs(id),
  texte      TEXT NOT NULL CHECK (length(texte) BETWEEN 1 AND 300),
  envoye_le  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- l'historique se lit toujours par partie, du plus récent au plus ancien
CREATE INDEX IF NOT EXISTS messages_par_partie ON messages (partie, id);
