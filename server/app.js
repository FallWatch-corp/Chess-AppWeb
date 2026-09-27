const express = require('express');
require('./repository/db.js');
const { exigerConnexion } = require('./middlewares/exiger-connexion.js');

const app = express();

app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ statut: 'ok' });
});

app.get('/api/moi', exigerConnexion, (req, res) => {
  const { nom, elo } = req.joueur;
  res.json({ nom, elo });
});

module.exports = app;
