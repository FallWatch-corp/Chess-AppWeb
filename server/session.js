const { createHmac, timingSafeEqual } = require('node:crypto');

const COOKIE_NAME = 'chess_session';
const SECRET = process.env.SESSION_SECRET ?? 'developpement-seulement';
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

function signature(data) {
  return createHmac('sha256', SECRET).update(data).digest('base64url');
}

function readSession(req) {
  const cookies = Object.fromEntries(
    (req.headers.cookie ?? '').split(';').map((p) => p.trim().split('=')).filter(([n]) => n),
  );
  return verifySession(cookies[COOKIE_NAME]);
}

function writeSession(res, session) {
  res.cookie(COOKIE_NAME, signSession(session), { httpOnly: true, sameSite: 'lax', maxAge: DUREE_MS, path: '/' });
}

module.exports = { readSession, writeSession };