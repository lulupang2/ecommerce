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
    const adminRoles = ['admin', 'super_admin', 'cs', 'product_md', 'logistics', 'finance', 'viewer'];
    const allowed = role === 'admin' ? adminRoles.includes(req.user?.role) : req.user?.role === role;
    if (!allowed) return res.status(403).json({ code: 'FORBIDDEN' });
    next();
  };
}

function requireInternal(req, res, next) {
  const expected = process.env.INTERNAL_API_KEY || 'techzone-internal';
  if (req.headers['x-internal-key'] !== expected) return res.status(403).json({ code: 'FORBIDDEN' });
  next();
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (req.user?.role === 'admin' || req.user?.adminRole === 'super_admin' || req.user?.permissions?.includes(permission)) return next();
    return res.status(403).json({ code: 'MISSING_PERMISSION', permission });
  };
}

module.exports = { requireAuth, requireRole, requireInternal, requirePermission };
