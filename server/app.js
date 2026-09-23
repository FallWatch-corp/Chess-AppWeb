const express = require('express');
require('./repository/db.js');

const app = express();

app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ statut: 'ok' });
});

module.exports = app;
