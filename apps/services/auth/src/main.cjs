const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const { eq, asc } = require('drizzle-orm');
const { database } = require('@techzone/database/db');
const { users } = require('@techzone/database/schema');
const { server, listen } = require('@techzone/config/http');
const { publish, registerReliability } = require('@techzone/messaging/bus');
const { requireAuth, requireCsrf, requireCookieCsrf, requireRole, requireInternal, requirePermission } = require('@techzone/auth-platform/auth');
const { publicJwks, signAccessToken, accessCookieOptions, refreshCookieOptions } = require('@techzone/auth-platform/tokens');
const { hit, clear } = require('@techzone/auth-platform/rate-limit');
const { validateDto } = require('@techzone/config/validation');
const { LoginDto, RefreshDto, RegisterDto } = require('@techzone/contracts/dtos');

const db = database('auth');
const app = server('auth');
const refreshDays = 14;
const adminRoles = [
  ['super_admin', '슈퍼관리자', '모든 관리자 기능'],
  ['cs', 'CS 담당자', '회원·주문·반품 관리'],
  ['product_md', '상품 MD', '상품·가격·카테고리 관리'],
  ['logistics', '물류 담당자', '재고·입출고·배송 관리'],
  ['finance', '재무 담당자', '결제·환불·정산 조회'],
  ['viewer', '조회 전용', '관리자 데이터 조회'],
];
const permissionSeeds = [
  ['dashboard.read', '대시보드 조회'], ['orders.read', '주문 조회'], ['orders.update', '주문 변경'],
  ['products.read', '상품 조회'], ['products.update', '상품 변경'], ['inventory.read', '재고 조회'],
  ['inventory.update', '재고 변경'], ['fulfillment.update', '배송·반품 변경'], ['procurement.update', '발주 변경'],
  ['members.read', '회원 조회'], ['reviews.update', '리뷰 변경'], ['payments.refund', '환불 처리'],
  ['admin.manage', '관리자 권한 관리'], ['audit.read', '감사로그 조회'], ['export.data', '데이터 내보내기'],
];

async function init() {
  await db.wait();
  await registerReliability('auth', db);
  await db.query(`CREATE TABLE IF NOT EXISTS users (id UUID PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'customer',phone TEXT,status TEXT NOT NULL DEFAULT 'active',created_at TIMESTAMPTZ DEFAULT now(),updated_at TIMESTAMPTZ DEFAULT now())`);
  await db.query(`CREATE TABLE IF NOT EXISTS roles (id UUID PRIMARY KEY,code TEXT UNIQUE NOT NULL,name TEXT NOT NULL,description TEXT)`);
  await db.query(`CREATE TABLE IF NOT EXISTS permissions (id UUID PRIMARY KEY,code TEXT UNIQUE NOT NULL,name TEXT NOT NULL)`);
  await db.query(`CREATE TABLE IF NOT EXISTS user_roles (user_id UUID NOT NULL,role_id UUID NOT NULL,PRIMARY KEY(user_id,role_id))`);
  await db.query(`CREATE TABLE IF NOT EXISTS role_permissions (role_id UUID NOT NULL,permission_id UUID NOT NULL,PRIMARY KEY(role_id,permission_id))`);
  await db.query(`CREATE TABLE IF NOT EXISTS refresh_sessions(id UUID PRIMARY KEY,user_id UUID NOT NULL,family_id UUID NOT NULL,token_hash TEXT UNIQUE NOT NULL,client_type TEXT NOT NULL,expires_at TIMESTAMPTZ NOT NULL,revoked_at TIMESTAMPTZ,replaced_by UUID,ip_address TEXT,user_agent TEXT,created_at TIMESTAMPTZ DEFAULT now())`);
  await db.query(`CREATE INDEX IF NOT EXISTS refresh_sessions_family_idx ON refresh_sessions(family_id)`);
  for (const [code, name, description] of adminRoles) await db.query(`INSERT INTO roles(id,code,name,description) VALUES($1,$2,$3,$4) ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description`, [crypto.randomUUID(), code, name, description]);
  for (const [code, name] of permissionSeeds) await db.query(`INSERT INTO permissions(id,code,name) VALUES($1,$2,$3) ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name`, [crypto.randomUUID(), code, name]);
  await seedRolePermissions();
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (email && password) {
    let existing = await db.orm.select().from(users).where(eq(users.email, email)).limit(1);
    if (!existing[0]) {
      await db.orm.insert(users).values({ id: crypto.randomUUID(), email, passwordHash: await bcrypt.hash(password, 10), name: process.env.ADMIN_NAME || 'TECHZONE Admin', role: 'admin', status: 'active' });
      existing = await db.orm.select().from(users).where(eq(users.email, email)).limit(1);
    }
    await db.query(`INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code='super_admin' ON CONFLICT DO NOTHING`, [existing[0].id]);
  }
}

async function seedRolePermissions() {
  const mapping = {
    super_admin: permissionSeeds.map(item => item[0]),
    cs: ['dashboard.read', 'orders.read', 'orders.update', 'members.read', 'fulfillment.update'],
    product_md: ['dashboard.read', 'products.read', 'products.update', 'inventory.read'],
    logistics: ['dashboard.read', 'orders.read', 'inventory.read', 'inventory.update', 'fulfillment.update', 'procurement.update'],
    finance: ['dashboard.read', 'orders.read', 'payments.refund', 'audit.read', 'export.data'],
    viewer: ['dashboard.read', 'orders.read', 'products.read', 'inventory.read', 'members.read'],
  };
  for (const [role, permissions] of Object.entries(mapping)) {
    for (const permission of permissions) await db.query(`INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r,permissions p WHERE r.code=$1 AND p.code=$2 ON CONFLICT DO NOTHING`, [role, permission]);
  }
}

async function adminRoleFor(userId) {
  const result = await db.query(`SELECT r.code,r.name,array_remove(array_agg(p.code),NULL) permissions FROM user_roles ur JOIN roles r ON r.id=ur.role_id LEFT JOIN role_permissions rp ON rp.role_id=r.id LEFT JOIN permissions p ON p.id=rp.permission_id WHERE ur.user_id=$1 GROUP BY r.code,r.name LIMIT 1`, [userId]);
  return result.rows[0] || null;
}
function token(user, adminRole) { return signAccessToken({ sub: user.id, email: user.email, role: user.role, adminRole: adminRole?.code, permissions: adminRole?.permissions || [] }); }
const hashToken = value => crypto.createHash('sha256').update(value).digest('hex');
const publicUser = (user, adminRole) => ({ id: user.id, email: user.email, name: user.name, role: user.role, adminRole: adminRole?.code || null, permissions: adminRole?.permissions || [] });

async function issueSession(user, adminRole, req, res, familyId = crypto.randomUUID(), client = null) {
  const accessToken = token(user, adminRole);
  const refreshToken = crypto.randomBytes(48).toString('base64url');
  const refreshId = crypto.randomUUID();
  const clientType = req.headers['x-client-platform'] === 'capacitor' ? 'capacitor' : 'web';
  const query = client ? client.query.bind(client) : db.query;
  await query(`INSERT INTO refresh_sessions(id,user_id,family_id,token_hash,client_type,expires_at,ip_address,user_agent) VALUES($1,$2,$3,$4,$5,now()+($6||' days')::interval,$7,$8)`, [refreshId, user.id, familyId, hashToken(refreshToken), clientType, String(refreshDays), req.ip, String(req.headers['user-agent'] || '').slice(0, 500)]);
  const csrfToken = crypto.randomBytes(24).toString('base64url');
  if (clientType === 'web') {
    res.cookie('tz_access', accessToken, accessCookieOptions());
    res.cookie('tz_refresh', refreshToken, refreshCookieOptions());
    res.cookie('tz_csrf', csrfToken, { secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: refreshDays * 24 * 60 * 60_000 });
  }
  return { accessToken, ...(clientType === 'capacitor' ? { refreshToken } : {}), csrfToken, refreshId, familyId };
}

app.post('/auth/register', validateDto(RegisterDto), async (req, res) => {
  const { email, password, name, phone } = req.body;
  if (!email || !password || password.length < 8 || !name) return res.status(400).json({ code: 'INVALID_INPUT' });
  try {
    const user = { id: crypto.randomUUID(), email, name, role: 'customer' };
    await db.orm.insert(users).values({ id: user.id, email, passwordHash: await bcrypt.hash(password, 10), name, phone, role: 'customer', status: 'active' });
    await publish('user.registered', { userId: user.id, email, role: 'customer', name });
    const session = await issueSession(user, null, req, res);
    res.status(201).json({ user, ...session });
  } catch { res.status(409).json({ code: 'EMAIL_EXISTS' }); }
});
app.post('/auth/login', validateDto(LoginDto), async (req, res) => {
  const loginKey = `auth:login:${String(req.body.email || '').toLowerCase()}:${req.ip}`;
  const attempt = await hit(loginKey, { limit: 5, windowSeconds: 15 * 60, lockSeconds: 15 * 60 });
  if (!attempt.allowed) return res.status(429).set('Retry-After', String(attempt.retryAfter)).json({ code: 'LOGIN_LOCKED', message: '로그인 시도가 너무 많습니다.', retryAfter: attempt.retryAfter });
  const rows = await db.orm.select().from(users).where(eq(users.email, req.body.email)).limit(1);
  const user = rows[0];
  if (!user || user.status !== 'active' || !(await bcrypt.compare(req.body.password || '', user.passwordHash))) return res.status(401).json({ code: 'INVALID_CREDENTIALS' });
  await clear(loginKey);
  const adminRole = await adminRoleFor(user.id);
  const session = await issueSession(user, adminRole, req, res);
  res.json({ user: publicUser(user, adminRole), ...session });
});
app.post('/auth/refresh', requireCookieCsrf, validateDto(RefreshDto), async (req, res) => {
  const rawToken = req.body?.refreshToken || req.cookies?.tz_refresh;
  if (!rawToken) return res.status(401).json({ code: 'REFRESH_TOKEN_REQUIRED' });
  const result = await db.query(`SELECT s.*,u.email,u.name,u.role,u.status FROM refresh_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1`, [hashToken(rawToken)]);
  const current = result.rows[0];
  if (!current || current.expires_at <= new Date() || current.status !== 'active') return res.status(401).json({ code: 'REFRESH_TOKEN_INVALID' });
  if (current.revoked_at) {
    await db.query(`UPDATE refresh_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE family_id=$1`, [current.family_id]);
    return res.status(401).json({ code: 'REFRESH_TOKEN_REUSED' });
  }
  const user = { id: current.user_id, email: current.email, name: current.name, role: current.role };
  const adminRole = await adminRoleFor(user.id);
  const client = await db.pool.connect();
  let session;
  try {
    await client.query('BEGIN');
    const locked = await client.query(`SELECT revoked_at FROM refresh_sessions WHERE id=$1 FOR UPDATE`, [current.id]);
    if (locked.rows[0]?.revoked_at) {
      await client.query(`UPDATE refresh_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE family_id=$1`, [current.family_id]);
      await client.query('COMMIT');
      return res.status(401).json({ code: 'REFRESH_TOKEN_REUSED' });
    }
    session = await issueSession(user, adminRole, req, res, current.family_id, client);
    await client.query(`UPDATE refresh_sessions SET revoked_at=now(),replaced_by=$2 WHERE id=$1`, [current.id, session.refreshId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  res.json({ user: publicUser(user, adminRole), ...session });
});
app.post('/auth/logout', requireCookieCsrf, validateDto(RefreshDto), async (req, res) => {
  const rawToken = req.body?.refreshToken || req.cookies?.tz_refresh;
  if (rawToken) await db.query(`UPDATE refresh_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE token_hash=$1`, [hashToken(rawToken)]);
  res.clearCookie('tz_access', accessCookieOptions());
  res.clearCookie('tz_refresh', refreshCookieOptions());
  res.clearCookie('tz_csrf', { path: '/' });
  res.status(204).end();
});
app.get('/auth/session', requireAuth, async (req, res) => {
  const rows = await db.orm.select().from(users).where(eq(users.id, req.user.sub)).limit(1);
  if (!rows[0]) return res.status(404).json({ code: 'NOT_FOUND' });
  const adminRole = await adminRoleFor(rows[0].id);
  res.json({ user: publicUser(rows[0], adminRole), csrfToken: req.cookies?.tz_csrf || null });
});
app.get('/.well-known/jwks.json', (_, res) => res.json(publicJwks()));
app.get('/auth/me', requireAuth, async (req, res) => {
  const rows = await db.orm.select({ id: users.id, email: users.email, name: users.name, role: users.role, status: users.status }).from(users).where(eq(users.id, req.user.sub)).limit(1);
  if (!rows[0]) return res.status(404).json({ code: 'NOT_FOUND' });
  const adminRole = await adminRoleFor(rows[0].id);
  res.json({ ...rows[0], adminRole: adminRole?.code || null, permissions: adminRole?.permissions || [] });
});
app.get('/auth/users', requireAuth, requireRole('admin'), async (_, res) => {
  const result = await db.query(`SELECT u.id,u.email,u.name,u.phone,u.status,u.role,u.created_at AS "createdAt",r.code AS "adminRole",r.name AS "adminRoleName" FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id ORDER BY u.created_at DESC`);
  res.json({ items: result.rows });
});
app.get('/auth/roles', requireAuth, requireRole('admin'), async (_, res) => {
  const result = await db.query(`SELECT r.id,r.code,r.name,r.description,array_remove(array_agg(p.code ORDER BY p.code),NULL) permissions FROM roles r LEFT JOIN role_permissions rp ON rp.role_id=r.id LEFT JOIN permissions p ON p.id=rp.permission_id GROUP BY r.id ORDER BY r.name`);
  res.json({ items: result.rows });
});
app.patch('/auth/users/:id/role', requireAuth, requireCsrf, requireRole('admin'), requirePermission('admin.manage'), async (req, res) => {
  const role = await db.query(`SELECT id,code FROM roles WHERE code=$1`, [req.body.role]);
  if (!role.rows[0]) return res.status(400).json({ code: 'INVALID_ROLE' });
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM user_roles WHERE user_id=$1`, [req.params.id]);
    await client.query(`INSERT INTO user_roles(user_id,role_id) VALUES($1,$2)`, [req.params.id, role.rows[0].id]);
    await client.query(`UPDATE users SET role=$2,updated_at=now() WHERE id=$1`, [req.params.id, role.rows[0].code === 'super_admin' ? 'admin' : role.rows[0].code]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await publish('admin.role_changed', { userId: req.params.id, role: role.rows[0].code, actorId: req.user.sub });
  res.json({ id: req.params.id, role: role.rows[0].code });
});
app.get('/internal/users', requireInternal, async (_, res) => {
  const rows = await db.orm.select({ id: users.id, email: users.email, name: users.name, role: users.role, status: users.status, createdAt: users.createdAt }).from(users).orderBy(asc(users.createdAt));
  res.json({ items: rows });
});
app.get('/internal/users/:id/exists', requireInternal, async (req, res) => {
  const rows = await db.query(`SELECT EXISTS(SELECT 1 FROM users WHERE id=$1) exists`, [req.params.id]);
  res.json({ exists: rows.rows[0].exists });
});

init().then(() => listen(app, 'auth')).catch(error => { console.error(error); process.exitCode = 1; });
