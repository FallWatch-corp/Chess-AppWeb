const { randomInt } = require('node:crypto');
const { DEFAULT_POSITION } = require('chess.js');
const { insererPartie } = require('../repository/parties.js');

// On a enlevé 0, O, 1, I et L parce qu'on les confond facilement.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LONGUEUR_CODE = 6;
const TENTATIVES_MAX = 5;
const SQLITE_CONSTRAINT_UNIQUE = 2067;

function genererCode() {
  let code = '';
  for (let i = 0; i < LONGUEUR_CODE; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

// Le code est UNIQUE dans la base. Si jamais on tombe sur un code deja pris
// (ça devrait presque jamais arriver), on en genere un autre.
function creerPartie(createurId, generer = genererCode) {
  for (let tentative = 1; ; tentative++) {
    try {
      return insererPartie({ code: generer(), createurId, fen: DEFAULT_POSITION });
    } catch (erreur) {
      if (erreur.errcode !== SQLITE_CONSTRAINT_UNIQUE || tentative >= TENTATIVES_MAX) {
        throw erreur;
      }
    }
  }
}

module.exports = { creerPartie, genererCode, ALPHABET, LONGUEUR_CODE };
