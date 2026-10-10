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
if (!colonnesParties.includes('cause')) {
  db.exec('ALTER TABLE parties ADD COLUMN cause TEXT');
}

module.exports = db;
