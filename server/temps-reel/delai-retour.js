const { setTimeout, clearTimeout } = require('node:timers');
const { abandonner } = require('../services/fin-partie.js');
const { ErreurApi } = require('../services/erreur-api.js');
const { trouverPartieParId } = require('../repository/parties.js');
const { enregistrerDelai, supprimerDelai, listerDelais } = require('../repository/delais-retour.js');

const delais = new Map();

function dureeDelai() {
  return Number(process.env.DELAI_RETOUR_MS) || 60000;
}

function cle(partieId, couleur) {
  return `${partieId}:${couleur}`;
}

function annulerDelai(partieId, couleur) {
  supprimerDelai(partieId, couleur);
  const delai = delais.get(cle(partieId, couleur));
  if (!delai) return;
  clearTimeout(delai.minuterie);
  delais.delete(cle(partieId, couleur));
}

function planifier(partieId, couleur, joueurId, echeance, quandExpire) {
  const minuterie = setTimeout(() => {
    delais.delete(cle(partieId, couleur));
    expirer(partieId, joueurId, quandExpire);
  }, Math.max(0, echeance - Date.now()));
  minuterie.unref();
  delais.set(cle(partieId, couleur), { echeance, minuterie });
}

function demarrerDelai(partieId, couleur, joueurId, quandExpire) {
  if (delais.has(cle(partieId, couleur))) return;
  const echeance = Date.now() + dureeDelai();
  enregistrerDelai(partieId, couleur, echeance);
  planifier(partieId, couleur, joueurId, echeance, quandExpire);
}

function expirer(partieId, joueurId, quandExpire) {
  annulerDelai(partieId, 'blanc');
  annulerDelai(partieId, 'noir');
  try {
    abandonner(partieId, joueurId);
  } catch (erreur) {
    if (!(erreur instanceof ErreurApi)) console.error(erreur);
    return;
  }
  quandExpire(partieId);
}

function synchroniserDelais(partie, presence, quandExpire) {
  for (const couleur of ['blanc', 'noir']) {
    const joueurId = partie[couleur];
    if (partie.statut === 'en_cours' && joueurId && presence[couleur] === 'hors_ligne') {
      demarrerDelai(partie.id, couleur, joueurId, quandExpire);
    } else {
      annulerDelai(partie.id, couleur);
    }
  }
}

function reprendreDelais(quandExpire) {
  for (const { partie: partieId, couleur, echeance } of listerDelais()) {
    const partie = trouverPartieParId(partieId);
    if (partie?.statut !== 'en_cours' || !partie[couleur]) {
      supprimerDelai(partieId, couleur);
    } else if (!delais.has(cle(partieId, couleur))) {
      planifier(partieId, couleur, partie[couleur], echeance, quandExpire);
    }
  }
}

function tempsRestants(partieId) {
  const reste = (couleur) => {
    const delai = delais.get(cle(partieId, couleur));
    return delai ? Math.max(0, delai.echeance - Date.now()) : null;
  };
  return { blanc: reste('blanc'), noir: reste('noir') };
}

module.exports = { synchroniserDelais, reprendreDelais, tempsRestants };
