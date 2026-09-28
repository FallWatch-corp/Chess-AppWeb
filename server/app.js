const express = require('express');
require('./repository/db.js');
const { exigerConnexion } = require('./middlewares/exiger-connexion.js');
const { trouverOuCreerJoueur } = require('./repository/joueurs.js');
const { readSession, writeSession } = require('./session.js');
const routesParties = require('./routes/parties.js');

const app = express();

app.use(express.json());
app.use((req, res, next) => {
  req.session = readSession(req);
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ statut: 'ok' });
});

app.get('/api/auth/login', (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: 'http://localhost:3000/api/auth/callback',
    scope: 'read:user',
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

app.get('/api/auth/callback', async (req, res) => {
  const { code } = req.query;

  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });
  const { access_token } = await tokenResponse.json();

  const profileResponse = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  const profil = await profileResponse.json();

  const joueur = trouverOuCreerJoueur({ githubId: profil.id, nom: profil.login });
  writeSession(res, { joueurId: joueur.id });
  res.redirect('http://localhost:5173');
});

app.get('/api/moi', exigerConnexion, (req, res) => {
  const { nom, elo } = req.joueur;
  res.json({ nom, elo });
});

app.use('/api/parties', routesParties);

module.exports = app;