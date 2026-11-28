const { setTimeout, clearTimeout } = require('node:timers');
const { abandonner } = require('../services/fin-partie.js');
const { ErreurApi } = require('../services/erreur-api.js');

const delais = new Map();

function dureeDelai() {
  return Number(process.env.DELAI_RETOUR_MS) || 60000;
}

function cle(partieId, couleur) {
  return `${partieId}:${couleur}`;
}

function annulerDelai(partieId, couleur) {
  const delai = delais.get(cle(partieId, couleur));
  if (!delai) return;
  clearTimeout(delai.minuterie);
  delais.delete(cle(partieId, couleur));
}

function demarrerDelai(partieId, couleur, joueurId, quandExpire) {
  if (delais.has(cle(partieId, couleur))) return;

  const duree = dureeDelai();
  const minuterie = setTimeout(() => {
    delais.delete(cle(partieId, couleur));
    expirer(partieId, joueurId, quandExpire);
  }, duree);
  minuterie.unref();
  delais.set(cle(partieId, couleur), { echeance: Date.now() + duree, minuterie });
}

function expirer(partieId, joueurId, quandExpire) {
  try {
    abandonner(partieId, joueurId);
  } catch (erreur) {
    if (!(erreur instanceof ErreurApi)) console.error(erreur);
    return;
  }
  annulerDelai(partieId, 'blanc');
  annulerDelai(partieId, 'noir');
  quandExpire(partieId);
}

function synchroniserDelais(partie, presence, quandExpire) {
  // En quotidien, fermer la page est normal : seule l'échéance de 24 h compte (#66).
  const quotidienne = partie.cadence === 'quotidien';
  for (const couleur of ['blanc', 'noir']) {
    const joueurId = partie[couleur];
    if (!quotidienne && partie.statut === 'en_cours' && joueurId && presence[couleur] === 'hors_ligne') {
      demarrerDelai(partie.id, couleur, joueurId, quandExpire);
    } else {
      annulerDelai(partie.id, couleur);
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

module.exports = { synchroniserDelais, tempsRestants };
