const express = require('express');
const { exigerConnexion } = require('../middlewares/exiger-connexion.js');
const { creerPartie, rejoindrePartie } = require('../services/parties.js');
const { jouerCoup } = require('../services/coups.js');
const { abandonner } = require('../services/fin-partie.js');
const { trouverPartieParId, listerCoups, listerPartiesTerminees } = require('../repository/parties.js');
const { trouverJoueurParId } = require('../repository/joueurs.js');

const router = express.Router();

router.use(exigerConnexion);

router.post('/', (req, res) => {
  const partie = creerPartie(req.joueur.id);
  res.status(201).json(partie);
});

router.post('/rejoindre', (req, res) => {
  const resultat = rejoindrePartie(req.joueur.id, req.body?.code);
  res.json(resultat);
});

// L'historique : mes parties terminées, vues de mon côté (mon adversaire, ma couleur, mon Elo).
router.get('/', (req, res) => {
  const historique = listerPartiesTerminees(req.joueur.id).map((partie) => {
    const jeSuisBlanc = partie.blanc === req.joueur.id;
    const maCouleur = jeSuisBlanc ? 'blanc' : 'noir';
    let resultat = 'nulle';
    if (partie.resultat !== 'nulle') {
      resultat = partie.resultat === maCouleur ? 'victoire' : 'defaite';
    }

    return {
      id: partie.id,
      adversaire: jeSuisBlanc ? partie.nom_noir : partie.nom_blanc,
      couleur: maCouleur,
      resultat,
      cause: partie.cause,
      eloAvant: jeSuisBlanc ? partie.elo_blanc_avant : partie.elo_noir_avant,
      eloApres: jeSuisBlanc ? partie.elo_blanc_apres : partie.elo_noir_apres,
      date: partie.terminee_le,
    };
  });
  res.json(historique);
});

// Sert à afficher le code en attendant l'adversaire, puis l'échiquier (fen).
router.get('/:id', envoyerPartie);

// Le coup est validé par chess.js dans le service ; on renvoie la partie à jour.
router.post('/:id/coups', (req, res) => {
  jouerCoup(Number(req.params.id), req.joueur.id, req.body ?? {});
  envoyerPartie(req, res);
});

// L'adversaire voit l'abandon au prochain GET (interrogation toutes les 2 s).
router.post('/:id/abandon', (req, res) => {
  abandonner(Number(req.params.id), req.joueur.id);
  envoyerPartie(req, res);
});

function envoyerPartie(req, res) {
  const partie = trouverPartieParId(Number(req.params.id));
  if (!partie) {
    return res.status(404).json({ erreur: 'Partie introuvable.' });
  }

  const participants = [partie.createur, partie.blanc, partie.noir];
  if (!participants.includes(req.joueur.id)) {
    return res.status(403).json({ erreur: 'Vous ne participez pas à cette partie.' });
  }

  // couleur reste null tant que l'adversaire n'a pas rejoint
  let couleur = null;
  if (partie.blanc === req.joueur.id) couleur = 'blanc';
  if (partie.noir === req.joueur.id) couleur = 'noir';

  const { id, code, statut, fen } = partie;
  res.json({
    id,
    code,
    statut,
    couleur,
    fen,
    // dans une FEN, le 2e champ dit qui doit jouer : w (blancs) ou b (noirs)
    trait: fen.split(' ')[1] === 'b' ? 'noir' : 'blanc',
    blanc: joueurPublic(partie.blanc),
    noir: joueurPublic(partie.noir),
    coups: listerCoups(id),
    fin: finPublique(partie),
  });
}

// null tant que la partie n'est pas terminée.
// Les Elo viennent de la partie et pas du joueur : son Elo actuel a pu changer depuis.
function finPublique(partie) {
  if (partie.statut !== 'terminee') return null;
  return {
    resultat: partie.resultat,
    cause: partie.cause,
    eloBlanc: { avant: partie.elo_blanc_avant, apres: partie.elo_blanc_apres },
    eloNoir: { avant: partie.elo_noir_avant, apres: partie.elo_noir_apres },
  };
}

// null tant que personne n'a cette couleur (partie en attente)
function joueurPublic(joueurId) {
  if (joueurId === null) return null;
  const { nom, elo } = trouverJoueurParId(joueurId);
  return { nom, elo };
}

module.exports = router;
