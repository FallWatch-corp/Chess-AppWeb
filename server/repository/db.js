const { DatabaseSync } = require('node:sqlite');
const { mkdirSync, readFileSync } = require('node:fs');
const path = require('node:path');

const cheminBase = path.resolve(process.cwd(), process.env.DATABASE_PATH || './data/chess-app.db');
mkdirSync(path.dirname(cheminBase), { recursive: true });

const db = new DatabaseSync(cheminBase);
db.exec('PRAGMA foreign_keys = ON;');
db.exec(readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

// CREATE TABLE IF NOT EXISTS ne touche pas une table qui existe déjà :
// les colonnes ajoutées après coup doivent être ajoutées à la main aux anciennes bases.
const colonnesParties = db.prepare('PRAGMA table_info(parties)').all().map((c) => c.name);
for (const colonne of ['cause', 'terminee_le', 'echeance']) {
  if (!colonnesParties.includes(colonne)) {
    db.exec(`ALTER TABLE parties ADD COLUMN ${colonne} TEXT`);
  }
}
if (!colonnesParties.includes('cadence')) {
  db.exec(`ALTER TABLE parties ADD COLUMN cadence TEXT NOT NULL DEFAULT '10+0'`);
}
for(const colonne of ['temps_blanc', 'temps_noir']) {
  if (!colonnesParties.includes(colonne)) {
    db.exec(`ALTER TABLE parties ADD COLUMN ${colonne} INTEGER`);
  }
}

module.exports = db;
