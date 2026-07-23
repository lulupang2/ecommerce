const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { eq, asc } = require('drizzle-orm');
const { database } = require('../../shared/db');
const { users } = require('../../shared/schema');
const { server, listen } = require('../../shared/http');
const { publish } = require('../../shared/bus');
const { requireAuth, requireRole, requireInternal, requirePermission } = require('../../shared/auth');

const db = database('auth');
const app = server('auth');
const secret = process.env.JWT_SECRET || 'canvas-dev-secret';
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
  await db.query(`CREATE TABLE IF NOT EXISTS users (id UUID PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'customer',phone TEXT,status TEXT NOT NULL DEFAULT 'active',created_at TIMESTAMPTZ DEFAULT now(),updated_at TIMESTAMPTZ DEFAULT now())`);
  await db.query(`CREATE TABLE IF NOT EXISTS roles (id UUID PRIMARY KEY,code TEXT UNIQUE NOT NULL,name TEXT NOT NULL,description TEXT)`);
  await db.query(`CREATE TABLE IF NOT EXISTS permissions (id UUID PRIMARY KEY,code TEXT UNIQUE NOT NULL,name TEXT NOT NULL)`);
  await db.query(`CREATE TABLE IF NOT EXISTS user_roles (user_id UUID NOT NULL,role_id UUID NOT NULL,PRIMARY KEY(user_id,role_id))`);
  await db.query(`CREATE TABLE IF NOT EXISTS role_permissions (role_id UUID NOT NULL,permission_id UUID NOT NULL,PRIMARY KEY(role_id,permission_id))`);
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
function token(user, adminRole) { return jwt.sign({ sub: user.id, email: user.email, role: user.role, adminRole: adminRole?.code, permissions: adminRole?.permissions || [] }, secret, { expiresIn: '2h' }); }

app.post('/auth/register', async (req, res) => {
  const { email, password, name, phone } = req.body;
  if (!email || !password || password.length < 8 || !name) return res.status(400).json({ code: 'INVALID_INPUT' });
  try {
    const user = { id: crypto.randomUUID(), email, name, role: 'customer' };
    await db.orm.insert(users).values({ id: user.id, email, passwordHash: await bcrypt.hash(password, 10), name, phone, role: 'customer', status: 'active' });
    await publish('user.registered', { userId: user.id, email, role: 'customer', name });
    res.status(201).json({ user, accessToken: token(user, null) });
  } catch { res.status(409).json({ code: 'EMAIL_EXISTS' }); }
});
app.post('/auth/login', async (req, res) => {
  const rows = await db.orm.select().from(users).where(eq(users.email, req.body.email)).limit(1);
  const user = rows[0];
  if (!user || user.status !== 'active' || !(await bcrypt.compare(req.body.password || '', user.passwordHash))) return res.status(401).json({ code: 'INVALID_CREDENTIALS' });
  const adminRole = await adminRoleFor(user.id);
  const publicUser = { id: user.id, email: user.email, name: user.name, role: user.role, adminRole: adminRole?.code || null, permissions: adminRole?.permissions || [] };
  res.json({ user: publicUser, accessToken: token(user, adminRole) });
});
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
app.patch('/auth/users/:id/role', requireAuth, requireRole('admin'), requirePermission('admin.manage'), async (req, res) => {
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

init().then(() => listen(app, 'auth')).catch(error => { console.error(error); process.exitCode = 1; });
