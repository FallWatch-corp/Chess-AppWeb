const { test, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { utiliserBaseTemporaire } = require('./helpers/base-temporaire.js');

utiliserBaseTemporaire();
process.env.GITHUB_CLIENT_ID = 'id-de-test';
process.env.GITHUB_CLIENT_SECRET = 'secret-de-test';
process.env.SESSION_SECRET = 'cle-de-session-de-test';
process.env.URL_API = 'http://api.test';
process.env.URL_CLIENT = 'http://client.test';

const request = require('supertest');
const app = require('../app.js');
const { COOKIE_NAME } = require('../session.js');

afterEach(() => mock.restoreAll());

// On ne peut pas parler au vrai GitHub pendant les tests, donc on remplace fetch
function simulerGitHub({ token = 'jeton', profil = { id: 4242, login: 'octocat' } } = {}) {
  mock.method(globalThis, 'fetch', async (url) => {
    if (url.includes('access_token')) {
      return Response.json(token ? { access_token: token } : { error: 'bad_verification_code' });
    }
    return Response.json(profil);
  });
}

function extraireCookie(reponse, nom) {
  const ligne = (reponse.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${nom}=`));
  return ligne?.split(';')[0];
}

// Fait le /login pour avoir un vrai state, puis le callback avec ce state
async function connexion(query = {}) {
  const login = await request(app).get('/api/auth/login');
  const state = new URL(login.headers.location).searchParams.get('state');
  const cookieState = extraireCookie(login, 'oauth_state');
  const params = new URLSearchParams({ code: 'code-github', state, ...query });

  return request(app).get(`/api/auth/callback?${params}`).set('Cookie', cookieState);
}

test('GET /api/auth/login redirige vers GitHub avec les bonnes informations', async () => {
  const reponse = await request(app).get('/api/auth/login');

  assert.equal(reponse.status, 302);
  const url = new URL(reponse.headers.location);
  assert.equal(url.origin + url.pathname, 'https://github.com/login/oauth/authorize');
  assert.equal(url.searchParams.get('client_id'), 'id-de-test');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://api.test/api/auth/callback');
  assert.ok(url.searchParams.get('state'));
  assert.ok(extraireCookie(reponse, 'oauth_state'));
});

test('une connexion réussie crée la session et ramène au client', async () => {
  simulerGitHub();

  const reponse = await connexion();

  assert.equal(reponse.status, 302);
  assert.equal(reponse.headers.location, 'http://client.test');
  const cookieSession = extraireCookie(reponse, COOKIE_NAME);
  assert.ok(cookieSession);
  assert.match(reponse.headers['set-cookie'].join(), /HttpOnly/);

  const moi = await request(app).get('/api/moi').set('Cookie', cookieSession);
  assert.equal(moi.status, 200);
  assert.deepEqual(moi.body, { nom: 'octocat', elo: 1000 });
});

test('si le joueur refuse chez GitHub, il revient au client avec une erreur et sans session', async () => {
  simulerGitHub();

  const reponse = await connexion({ error: 'access_denied' });

  assert.equal(reponse.headers.location, 'http://client.test/?erreur=connexion');
  assert.equal(extraireCookie(reponse, COOKIE_NAME), undefined);
});

test('un state qui ne correspond pas est refusé', async () => {
  simulerGitHub();
  const login = await request(app).get('/api/auth/login');

  const reponse = await request(app)
    .get('/api/auth/callback?code=code-github&state=mauvais')
    .set('Cookie', extraireCookie(login, 'oauth_state'));

  assert.equal(reponse.headers.location, 'http://client.test/?erreur=connexion');
  assert.equal(extraireCookie(reponse, COOKIE_NAME), undefined);
});

test('si GitHub refuse le code, il revient au client avec une erreur', async () => {
  simulerGitHub({ token: null });

  const reponse = await connexion();

  assert.equal(reponse.headers.location, 'http://client.test/?erreur=connexion');
  assert.equal(extraireCookie(reponse, COOKIE_NAME), undefined);
});

test('un cookie de session modifié à la main est refusé (401)', async () => {
  simulerGitHub();
  const reponse = await connexion();
  const [nom, valeur] = extraireCookie(reponse, COOKIE_NAME).split('=');
  const [, signature] = valeur.split('.');
  const fauxContenu = Buffer.from(JSON.stringify({ joueurId: 1, exp: Date.now() + 60000 })).toString('base64url');

  const moi = await request(app).get('/api/moi').set('Cookie', `${nom}=${fauxContenu}.${signature}`);

  assert.equal(moi.status, 401);
});

test('la déconnexion efface la session et ramène à l\'accueil', async () => {
  simulerGitHub();
  const connecte = await connexion();
  const cookieSession = extraireCookie(connecte, COOKIE_NAME);

  const reponse = await request(app).post('/api/auth/logout').set('Cookie', cookieSession);

  assert.equal(reponse.status, 303);
  assert.equal(reponse.headers.location, 'http://client.test');
  const cookieEfface = extraireCookie(reponse, COOKIE_NAME);
  assert.equal(cookieEfface, `${COOKIE_NAME}=`);

  const moi = await request(app).get('/api/moi').set('Cookie', cookieEfface);
  assert.equal(moi.status, 401);
});

test('les routes protégées répondent 401 sans session', async () => {
  const moi = await request(app).get('/api/moi');
  const creer = await request(app).post('/api/parties');

  assert.equal(moi.status, 401);
  assert.equal(creer.status, 401);
});
