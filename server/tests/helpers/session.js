const express = require('express');

// On fait semblant que le joueur est connecté pour les tests
// (on ne peut pas passer par GitHub pendant les tests).
function appConnectee(app, joueurId) {
  const enveloppe = express();
  enveloppe.use((req, res, next) => {
    req.session = { joueurId };
    next();
  });
  enveloppe.use(app);
  return enveloppe;
}

module.exports = { appConnectee };
