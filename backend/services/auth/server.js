const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { eq } = require('drizzle-orm');
const { database } = require('../../shared/db');
const { users } = require('../../shared/schema');
const { server, listen } = require('../../shared/http');
const { publish } = require('../../shared/bus');
const db = database('auth'); const app = server('auth'); const secret = process.env.JWT_SECRET || 'canvas-dev-secret';
async function init() { await db.wait(); await db.query(`CREATE TABLE IF NOT EXISTS users (id UUID PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'customer', created_at TIMESTAMPTZ DEFAULT now())`); }
function token(user) { return jwt.sign({ sub: user.id, email: user.email, role: user.role }, secret, { expiresIn: '2h' }); }
app.post('/auth/register', async (req, res) => { const { email, password, name, role = 'customer' } = req.body; if (!email || !password || !name) return res.status(400).json({ code: 'INVALID_INPUT' }); try { const user = { id: crypto.randomUUID(), email, name, role }; await db.orm.insert(users).values({ id: user.id, email, passwordHash: await bcrypt.hash(password, 10), name, role }); await publish('user.registered', { userId: user.id, email, role }); res.status(201).json({ user, accessToken: token(user) }); } catch { res.status(409).json({ code: 'EMAIL_EXISTS' }); } });
app.post('/auth/login', async (req, res) => { const { email, password } = req.body; const rows = await db.orm.select().from(users).where(eq(users.email, email)).limit(1); const user = rows[0]; if (!user || !(await bcrypt.compare(password || '', user.passwordHash))) return res.status(401).json({ code: 'INVALID_CREDENTIALS' }); res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role }, accessToken: token(user) }); });
app.get('/auth/me', async (req, res) => { try { const data = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), secret); const rows = await db.orm.select({ id: users.id, email: users.email, name: users.name, role: users.role }).from(users).where(eq(users.id, data.sub)).limit(1); if (!rows[0]) return res.status(404).end(); res.json(rows[0]); } catch { res.status(401).json({ code: 'UNAUTHORIZED' }); } });
init().then(() => listen(app, 'auth')).catch(error => { console.error(error); process.exitCode = 1; });
