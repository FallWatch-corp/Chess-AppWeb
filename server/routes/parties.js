const express = require('express');
const { exigerConnexion } = require('../middlewares/exiger-connexion.js');
const { creerPartie } = require('../services/parties.js');
const { trouverPartieParId } = require('../repository/parties.js');

const router = express.Router();

router.use(exigerConnexion);

router.post('/', (req, res) => {
  const partie = creerPartie(req.joueur.id);
  res.status(201).json(partie);
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

  const { id, code, statut } = partie;
  res.json({ id, code, statut });
});

module.exports = router;
