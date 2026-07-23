const jwt = require('jsonwebtoken');

const secret = process.env.JWT_SECRET || 'canvas-dev-secret';

function readToken(req) {
  const value = req.headers.authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7) : '';
}

function requireAuth(req, res, next) {
  try {
    req.user = jwt.verify(readToken(req), secret);
    next();
  } catch {
    res.status(401).json({ code: 'UNAUTHORIZED' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) return res.status(403).json({ code: 'FORBIDDEN' });
    next();
  };
}

module.exports = { requireAuth, requireRole };
