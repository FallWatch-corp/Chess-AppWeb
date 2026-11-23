const express = require('express');
const { exigerConnexion } = require('../middlewares/exiger-connexion.js');
const { creerPartie, rejoindrePartie } = require('../services/parties.js');
const { jouerCoup } = require('../services/coups.js');
const { abandonner } = require('../services/fin-partie.js');
const { etatPartie } = require('../services/etat-partie.js');
const { trouverPartieParId, listerPartiesTerminees } = require('../repository/parties.js');
const { diffuserPartie } = require('../temps-reel/diffusion.js');

const router = express.Router();

// Public : n'importe qui (même sans compte) peut suivre une partie avec son lien.
// Pas d'exigerConnexion : un non-joueur ou un anonyme la reçoit en spectateur.
router.get('/:id', envoyerPartie);

router.use(exigerConnexion);

router.post('/', (req, res) => {
  const partie = creerPartie(req.joueur.id, req.body?.cadence);
  res.status(201).json(partie);
});

// La diffusion prévient le créateur, qui attend dans la salle d'attente, et lui donne sa couleur.
router.post('/rejoindre', (req, res) => {
  const resultat = rejoindrePartie(req.joueur.id, req.body?.code);
  res.json(resultat);
  diffuserPartie(resultat.id).catch(console.error);
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

// Le coup est validé par chess.js dans le service ; on renvoie la partie à jour,
// puis on la diffuse au salon (adversaire et spectateurs) sans faire attendre la réponse.
router.post('/:id/coups', (req, res) => {
  const partieId = Number(req.params.id);
  jouerCoup(partieId, req.joueur.id, req.body ?? {});
  envoyerPartie(req, res);
  diffuserPartie(partieId).catch(console.error);
});

// L'adversaire et les spectateurs reçoivent l'abandon par Socket.IO.
router.post('/:id/abandon', (req, res) => {
  const partieId = Number(req.params.id);
  abandonner(partieId, req.joueur.id);
  envoyerPartie(req, res);
  diffuserPartie(partieId).catch(console.error);
});

function envoyerPartie(req, res) {
  const partie = trouverPartieParId(Number(req.params.id));
  if (!partie) {
    return res.status(404).json({ erreur: 'Partie introuvable.' });
  }
  // Lue dans la session (et pas req.joueur) : la route GET est publique.
  res.json(etatPartie(partie, req.session?.joueurId ?? null));
}

module.exports = router;
