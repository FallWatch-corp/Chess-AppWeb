const express = require('express');
const { exigerConnexion } = require('../middlewares/exiger-connexion.js');
const { creerPartie, rejoindrePartie } = require('../services/parties.js');
const { trouverPartieParId } = require('../repository/parties.js');

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

// Pour l'instant ça sert juste à afficher le code, on va la compléter pour l'échiquier.
router.get('/:id', (req, res) => {
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

  const { id, code, statut } = partie;
  res.json({ id, code, statut, couleur });
});

module.exports = router;
