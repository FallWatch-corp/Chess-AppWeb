CREATE TABLE IF NOT EXISTS joueurs (
  id   INTEGER PRIMARY KEY,
  nom  TEXT NOT NULL,
  elo  INTEGER NOT NULL DEFAULT 1000 CHECK (elo BETWEEN 100 AND 3000)
);

CREATE TABLE IF NOT EXISTS parties (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  code              TEXT NOT NULL UNIQUE,
  blanc             INTEGER REFERENCES joueurs(id),
  noir              INTEGER REFERENCES joueurs(id),
  fen               TEXT NOT NULL,
  statut            TEXT NOT NULL DEFAULT 'en_attente',
  resultat          TEXT,
  elo_blanc_avant   INTEGER,
  elo_blanc_apres   INTEGER,
  elo_noir_avant    INTEGER,
  elo_noir_apres    INTEGER
);

CREATE TABLE IF NOT EXISTS coups (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  partie     INTEGER NOT NULL REFERENCES parties(id),
  ordre      INTEGER NOT NULL,
  coup       TEXT NOT NULL,
  UNIQUE (partie, ordre)
);
