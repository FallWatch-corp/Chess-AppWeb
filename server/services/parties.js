const { randomInt } = require('node:crypto');
const { DEFAULT_POSITION } = require('chess.js');
const {
  insererPartie,
  trouverPartieParCode,
  demarrerPartie,
} = require('../repository/parties.js');
const { ErreurApi } = require('./erreur-api.js');
const { trouverCadence } = require('./cadences.js');
const { trouverJoueurParId } = require('../repository/joueurs.js');
const { penduleAuDepart } = require('./pendule.js');

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
// La cadence est un id de la liste (services/cadences.js) ; un id inconnu est refusé.
function creerPartie(createurId, cadence = '10+0', generer = genererCode) {
  if (!trouverCadence(cadence)) {
    throw new ErreurApi(400, 'Cadence inconnue.');
  }
  for (let tentative = 1; ; tentative++) {
    try {
      const partie = insererPartie({ code: generer(), createurId, fen: DEFAULT_POSITION, cadence });
      // En base, seulement l'id ; on renvoie l'objet complet, comme etatPartie.
      return { ...partie, cadence: trouverCadence(partie.cadence) };
    } catch (erreur) {
      if (erreur.errcode !== SQLITE_CONSTRAINT_UNIQUE || tentative >= TENTATIVES_MAX) {
        throw erreur;
      }
    }
  }
}

function pileOuFace() {
  return randomInt(2) === 0;
}

// createurEstBlanc est un paramètre pour pouvoir tester les deux cas.
function rejoindrePartie(joueurId, code, createurEstBlanc = pileOuFace) {
  const partie = trouverPartieParCode(String(code ?? '').trim().toUpperCase());

  if (!partie) {
    throw new ErreurApi(404, 'Aucune partie ne correspond à ce code.');
  }
  if (partie.statut !== 'en_attente') {
    throw new ErreurApi(409, 'Ce code a déjà été utilisé.');
  }
  if (partie.createur === joueurId) {
    throw new ErreurApi(403, 'Vous ne pouvez pas jouer contre vous-même.');
  }

  const [blancId, noirId] = createurEstBlanc()
    ? [partie.createur, joueurId]
    : [joueurId, partie.createur];

  // Quelqu'un d'autre a pu rejoindre juste avant nous
  if (!demarrerPartie({ id: partie.id, blancId, noirId, ...penduleAuDepart(partie.cadence) })) {
    throw new ErreurApi(409, 'Ce code a déjà été utilisé.');
  }

  return { id: partie.id, couleur: joueurId === blancId ? 'blanc' : 'noir' };
}

function apercuPartie(code) {
  const partie = trouverPartieParCode(String(code ?? '').trim().toUpperCase());
  if (!partie) {
    throw new ErreurApi(404, 'Aucune partie ne correspond à ce code.');
  }
  if (partie.statut !== 'en_attente') {
    throw new ErreurApi(409, 'Ce code a déjà été utilisé.');
  }
  return { createur: trouverJoueurParId(partie.createur).nom, cadence: trouverCadence(partie.cadence) };
};  

module.exports = {  creerPartie, rejoindrePartie, genererCode, ALPHABET, LONGUEUR_CODE, apercuPartie };
