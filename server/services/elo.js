const ELO_MIN = 100;
const ELO_MAX = 3000;
const FACTEUR_K = 20;


const SCORES_VALIDES = [0, 0.5, 1];

function attendu(eloA, eloB) {
  return 1 / (1 + 10 ** ((eloB - eloA) / 400));
}

function nouvelElo(eloA, eloB, scoreA) {
  if (!SCORES_VALIDES.includes(scoreA)) {
    throw new RangeError(`Score invalide : ${scoreA} (attendu 0, 0.5 ou 1).`);
  }

  const brut = eloA + FACTEUR_K * (scoreA - attendu(eloA, eloB));
  return Math.min(ELO_MAX, Math.max(ELO_MIN, Math.round(brut)));
}


function nouveauxElo(eloA, eloB, scoreA) {
  return {
    eloA: nouvelElo(eloA, eloB, scoreA),
    eloB: nouvelElo(eloB, eloA, 1 - scoreA),
  };
}

module.exports = { attendu, nouvelElo, nouveauxElo };
