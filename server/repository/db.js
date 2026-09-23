const { DatabaseSync } = require('node:sqlite');
const { mkdirSync, readFileSync } = require('node:fs');
const path = require('node:path');

const cheminBase = path.resolve(process.cwd(), process.env.DATABASE_PATH || './data/chess-app.db');
mkdirSync(path.dirname(cheminBase), { recursive: true });

const db = new DatabaseSync(cheminBase);
db.exec('PRAGMA foreign_keys = ON;');
db.exec(readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

module.exports = db;
