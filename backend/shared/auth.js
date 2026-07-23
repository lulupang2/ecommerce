const { verifyAccessToken } = require('../platform/tokens');
const { setContextFields } = require('../platform/context');

function readToken(req) {
  const value = req.headers.authorization || '';
  if (value.startsWith('Bearer ') && !['undefined', 'null', ''].includes(value.slice(7))) return { token: value.slice(7), source: 'bearer' };
  if (req.cookies?.tz_access) return { token: req.cookies.tz_access, source: 'cookie' };
  return { token: '', source: 'none' };
}

async function requireAuth(req, res, next) {
  try {
    const credential = readToken(req);
    req.user = await verifyAccessToken(credential.token);
    req.authSource = credential.source;
    setContextFields({ actorId: req.user.sub, userId: req.user.sub });
    if (!csrfValid(req)) return csrfFailure(req, res);
    next();
  } catch (error) {
    res.status(401).json({ code: 'UNAUTHORIZED', message: '인증이 필요합니다.', requestId: req.requestId, timestamp: new Date().toISOString() });
  }
}

async function optionalAuth(req, _res, next) {
  const credential = readToken(req);
  if (!credential.token) return next();
  try {
    req.user = await verifyAccessToken(credential.token);
    req.authSource = credential.source;
    setContextFields({ actorId: req.user.sub, userId: req.user.sub });
    if (!csrfValid(req)) return csrfFailure(req, _res);
  } catch {
    req.authError = 'INVALID_TOKEN';
  }
  next();
}

function requireCsrf(req, res, next) {
  if (!csrfValid(req)) return csrfFailure(req, res);
  next();
}

function requireCookieCsrf(req, res, next) {
  if (req.headers['x-client-platform'] === 'capacitor' || !req.cookies?.tz_refresh) return next();
  if (!req.cookies?.tz_csrf || req.headers['x-csrf-token'] !== req.cookies.tz_csrf) return csrfFailure(req, res);
  next();
}

function csrfValid(req) {
  if (req.authSource !== 'cookie' || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
  return Boolean(req.cookies?.tz_csrf && req.headers['x-csrf-token'] && req.cookies.tz_csrf === req.headers['x-csrf-token']);
}

function csrfFailure(req, res) {
  return res.status(403).json({ code: 'CSRF_INVALID', message: 'CSRF 토큰이 올바르지 않습니다.', requestId: req.requestId, timestamp: new Date().toISOString() });
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

function requireOwner(param = 'userId') {
  return (req, res, next) => {
    if (req.user?.sub === req.params[param] || req.user?.role === 'admin' || req.user?.adminRole === 'super_admin') return next();
    return res.status(403).json({ code: 'RESOURCE_FORBIDDEN', message: '다른 사용자의 리소스에 접근할 수 없습니다.', requestId: req.requestId, timestamp: new Date().toISOString() });
  };
}

module.exports = { requireAuth, optionalAuth, requireCsrf, requireCookieCsrf, requireOwner, requireRole, requireInternal, requirePermission };
