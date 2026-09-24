const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

function utiliserBaseTemporaire() {
  const dossier = mkdtempSync(path.join(tmpdir(), 'chess-appweb-test-'));
  process.env.DATABASE_PATH = path.join(dossier, 'test.db');
}

module.exports = { utiliserBaseTemporaire };
