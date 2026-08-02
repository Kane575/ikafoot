import jwt from 'jsonwebtoken';

const COOKIE_NAME = 'ikafoot_admin';
const MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 heures

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 16) {
    throw new Error('JWT_SECRET manquant ou trop court (32 caractères minimum recommandés).');
  }
  return value;
}

export function issueSession(res, admin) {
  const token = jwt.sign({ sub: admin.id, phone: admin.phone, name: admin.name }, secret(), {
    expiresIn: MAX_AGE_MS / 1000,
  });

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true, // inaccessible au JavaScript de la page : pas de vol par XSS
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE_MS,
    path: '/',
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

export function readSession(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;

  try {
    return jwt.verify(token, secret());
  } catch {
    return null;
  }
}

/** Middleware : bloque la route si aucune session admin valide n'est présente. */
export function requireAdmin(req, res, next) {
  const session = readSession(req);
  if (!session) {
    return res.status(401).json({ message: 'Session expirée, reconnectez-vous.' });
  }

  req.admin = session;
  next();
}

/** Normalise « 76 73 37 49 », « +223 76733749 » … vers une forme comparable. */
export function normalizePhone(value) {
  return String(value ?? '')
    .replace(/[^\d]/g, '')
    .replace(/^223/, '');
}
