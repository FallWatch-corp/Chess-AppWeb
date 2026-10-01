const express = require('express');
const { randomBytes } = require('node:crypto');
const { trouverOuCreerJoueur } = require('../repository/joueurs.js');
const { writeSession, readCookie } = require('../session.js');

const router = express.Router();

const COOKIE_STATE = 'oauth_state';

// URL_API = l'adresse de l'API vue par le navigateur (pour le retour de GitHub)
// URL_CLIENT = l'adresse du site React
function urlCallback() {
  return `${process.env.URL_API}/api/auth/callback`;
}

function retourAvecErreur(res) {
  res.redirect(`${process.env.URL_CLIENT}/?erreur=connexion`);
}

router.get('/login', (req, res) => {
  // le state c'est une valeur au hasard qu'on garde dans un cookie et que GitHub
  // nous renvoie. Si ça ne correspond pas, quelqu'un a essayé de nous piéger (CSRF).
  const state = randomBytes(16).toString('hex');
  res.cookie(COOKIE_STATE, state, { httpOnly: true, sameSite: 'lax', maxAge: 10 * 60 * 1000, path: '/' });

  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: urlCallback(),
    scope: 'read:user',
    state,
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const stateAttendu = readCookie(req, COOKIE_STATE);
  res.clearCookie(COOKIE_STATE, { path: '/' });

  // error = le joueur a cliqué Annuler chez GitHub
  if (error || !code || !state || state !== stateAttendu) {
    return retourAvecErreur(res);
  }

  try {
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: urlCallback(),
      }),
    });
    const { access_token } = await tokenResponse.json();
    if (!access_token) return retourAvecErreur(res);

    const profileResponse = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/vnd.github+json' },
    });
    if (!profileResponse.ok) return retourAvecErreur(res);
    const profil = await profileResponse.json();

    const joueur = trouverOuCreerJoueur({ githubId: profil.id, nom: profil.login });
    writeSession(res, { joueurId: joueur.id });
    res.redirect(process.env.URL_CLIENT);
  } catch (erreur) {
    // GitHub injoignable par exemple
    console.error(erreur);
    retourAvecErreur(res);
  }
});

module.exports = router;
