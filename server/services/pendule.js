const { trouverCadence } = require('./cadences.js');

// La pendule quand l'adversaire rejoint. Les temps sont en millisecondes.
// echeance : l'instant où le joueur au trait (les blancs, au départ) perd au temps s'il n'a pas joué.
function penduleAuDepart(cadenceId, maintenant = new Date()) {
  const cadence = trouverCadence(cadenceId);
  const base = cadence.base * 1000;
  if (cadence.categorie === 'quotidien') {
    return { echeance: new Date(maintenant.getTime() + base).toISOString(), tempsBlanc: null, tempsNoir: null };
  }
  return { echeance: new Date(maintenant.getTime() + base).toISOString(), tempsBlanc: base, tempsNoir: base };
}

// La pendule après un coup accepté, joué à l'instant maintenant.
// Le joueur qui vient de jouer garde ce qui lui restait, plus l'incrément ;
// l'échéance passe à l'adversaire, avec le temps qu'il avait.
function penduleApresCoup(partie, maintenant = new Date()) {
  const cadence = trouverCadence(partie.cadence);
  const base = cadence.base * 1000;
  if (cadence.categorie === 'quotidien') {
    return { echeance: new Date(maintenant.getTime() + base).toISOString(), tempsBlanc: null, tempsNoir: null };
  }

  // le trait dans la FEN d'avant le coup : c'est le joueur qui vient de jouer
  const joueur = partie.fen.split(' ')[1] === 'w' ? 'blanc' : 'noir';
  const adversaire = joueur === 'blanc' ? 'noir' : 'blanc';

  const temps = { blanc: partie.temps_blanc, noir: partie.temps_noir };
  const restait = Date.parse(partie.echeance) - maintenant.getTime();
  temps[joueur] = restait + cadence.increment * 1000;

  return {
    echeance: new Date(maintenant.getTime() + temps[adversaire]).toISOString(),
    tempsBlanc: temps.blanc,
    tempsNoir: temps.noir,
  };
}

// Le temps qui reste à chaque joueur, en millisecondes, à l'instant maintenant.
// On envoie une durée plutôt qu'une heure : la pendule reste juste même si l'horloge du client est décalée.
// null en salle d'attente et en quotidien (pas de pendule).
function penduleRestante(partie, maintenant = new Date()) {
  if (partie.temps_blanc === null) return null;

  const auTrait = partie.fen.split(' ')[1] === 'w' ? 'blanc' : 'noir';
  const temps = { blanc: partie.temps_blanc, noir: partie.temps_noir };

  if (partie.statut === 'en_cours') {
    // seul le temps du joueur au trait s'écoule ; l'échéance est l'instant où il tombe à 0
    temps[auTrait] = Math.max(0, Date.parse(partie.echeance) - maintenant.getTime());
  } else if (partie.cause === 'temps') {
    // perdu au temps : en base, le perdant a encore le temps qu'il avait au début de son tour
    temps[auTrait] = 0;
  }
  // partie terminée autrement : les temps enregistrés au dernier coup, figés
  return temps;
}

module.exports = { penduleAuDepart, penduleApresCoup, penduleRestante };
