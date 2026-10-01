const { createHmac, timingSafeEqual } = require('node:crypto');

const COOKIE_NAME = 'chess_session';
const DUREE_MS = 7 * 24 * 60 * 60 * 1000;

function signSession(session) {
  const contenu = { ...session, exp: Date.now() + DUREE_MS };
  const data = Buffer.from(JSON.stringify(contenu)).toString('base64url');
  return `${data}.${signature(data)}`;
}

function verifySession(value) {
  const [data, sig] = (value ?? '').split('.');
  if (!data || !sig) return {};
  const expected = signature(data);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return {};
  }
  try {
    const session = JSON.parse(Buffer.from(data, 'base64url').toString());
    return session.exp > Date.now() ? session : {};
  } catch {
    return {};
  }
}

// Pas de valeur par défaut : sans la clé, n'importe qui pourrait fabriquer un cookie valide
function signature(data) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET manque dans les variables d\'environnement.');
  return createHmac('sha256', secret).update(data).digest('base64url');
}

function readCookie(req, nom) {
  const cookies = Object.fromEntries(
    (req.headers.cookie ?? '').split(';').map((p) => p.trim().split('=')).filter(([n]) => n),
  );
  return cookies[nom];
}

function readSession(req) {
  return verifySession(readCookie(req, COOKIE_NAME));
}

function writeSession(res, session) {
  res.cookie(COOKIE_NAME, signSession(session), { httpOnly: true, sameSite: 'lax', maxAge: DUREE_MS, path: '/' });
}

module.exports = { readSession, writeSession, readCookie, COOKIE_NAME };
