const express = require('express');
require('./repository/db.js');
const { exigerConnexion } = require('./middlewares/exiger-connexion.js');
const { readSession } = require('./session.js');
const routesAuth = require('./routes/auth.js');
const routesParties = require('./routes/parties.js');

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

module.exports = app;
