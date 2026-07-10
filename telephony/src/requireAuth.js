import jwt from 'jsonwebtoken';
import config from './config.js';

// Same contract as the studio backend: HS256 pinned, iss/aud enforced, 30s leeway.
// Header only — tokens in query strings leak via logs/history/referrers.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || !config.authJwtSecret) {
    return res.status(401).json({ error: 'authentication required' });
  }
  try {
    const payload = jwt.verify(token, config.authJwtSecret, {
      algorithms: ['HS256'],
      issuer: 'dharwin-auth',
      audience: 'dharwin-api',
      clockTolerance: 30,
    });
    req.userId = payload.sub;
    return next();
  } catch {
    return res.status(401).json({ error: 'invalid or expired token' });
  }
}
