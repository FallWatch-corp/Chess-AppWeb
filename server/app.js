const express = require('express');
require('./repository/db.js');

const app = express();

app.use(express.json());

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

module.exports = app;
