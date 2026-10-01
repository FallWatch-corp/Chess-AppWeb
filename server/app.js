const express = require('express');
require('./repository/db.js');
const { exigerConnexion } = require('./middlewares/exiger-connexion.js');
const { readSession } = require('./session.js');
const routesAuth = require('./routes/auth.js');
const routesParties = require('./routes/parties.js');
const { ErreurApi } = require('./services/erreur-api.js');

const app = express();

app.use(express.json());
app.use((req, res, next) => {
  if (!req.session) {
    req.session = readSession(req);
  }
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ statut: 'ok' });
});

app.use('/api/auth', routesAuth);

app.get('/api/moi', exigerConnexion, (req, res) => {
  const { nom, elo } = req.joueur;
  res.json({ nom, elo });
});

app.use('/api/parties', routesParties);

// Doit rester a la fin. Les ErreurApi deviennent une réponse JSON avec leur code,
// le reste c'est une vraie erreur donc 500.
// eslint-disable-next-line no-unused-vars
app.use((erreur, req, res, next) => {
  if (erreur instanceof ErreurApi) {
    return res.status(erreur.statut).json({ erreur: erreur.message });
  }
  console.error(erreur);
  res.status(500).json({ erreur: 'Erreur interne du serveur.' });
});

module.exports = app;
