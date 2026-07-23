import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const root = process.cwd();
const services = {
  auth: 'auth',
  catalog: 'catalog',
  cart: 'cart',
  order: 'orders',
  payment: 'payments',
  inventory: 'inventory',
  notification: 'notifications',
  search: 'search',
  media: 'media',
  fulfillment: 'fulfillment',
  procurement: 'procurement',
  admin: 'admin',
};
const platformSql = `
  CREATE TABLE IF NOT EXISTS outbox_events (
    id UUID PRIMARY KEY,event_type TEXT NOT NULL,payload JSONB NOT NULL,occurred_at TIMESTAMPTZ NOT NULL,
    published_at TIMESTAMPTZ,attempts INTEGER NOT NULL DEFAULT 0,last_error TEXT
  );
  CREATE INDEX IF NOT EXISTS outbox_unpublished_idx ON outbox_events(occurred_at) WHERE published_at IS NULL;
  CREATE TABLE IF NOT EXISTS inbox_events (
    event_id UUID PRIMARY KEY,event_type TEXT NOT NULL,processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS dead_letters (
    id UUID PRIMARY KEY,service TEXT NOT NULL,event_id UUID NOT NULL,event_type TEXT NOT NULL,envelope JSONB NOT NULL,
    error TEXT NOT NULL,retry_count INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),resolved_at TIMESTAMPTZ
  );
  CREATE TABLE IF NOT EXISTS idempotency_keys (
    scope TEXT NOT NULL,idempotency_key TEXT NOT NULL,request_hash TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'processing',
    response_status INTEGER,response_body JSONB,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT now()+interval '24 hours',PRIMARY KEY(scope,idempotency_key)
  );
`;

function extractDdl(source) {
  const statements = [];
  const pattern = /db\.query\(`([\s\S]*?)`(?:,\s*\[[\s\S]*?\])?\)/g;
  for (const match of source.matchAll(pattern)) {
    const sql = match[1].trim();
    if (sql.includes('${')) continue;
    if (/^(CREATE|ALTER|DO \$\$)/i.test(sql)) statements.push(sql);
  }
  return statements;
}

async function migrateService(service, database) {
  const source = await fs.readFile(path.join(root, 'backend', 'services', service, 'server.js'), 'utf8');
  const statements = [...extractDdl(source), platformSql];
  const user = encodeURIComponent(process.env.POSTGRES_USER || 'canvas');
  const password = encodeURIComponent(process.env.POSTGRES_PASSWORD || 'canvas');
  const connectionString = `postgres://${user}:${password}@${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || 5432}/${database}`;
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS drizzle_migrations(id TEXT PRIMARY KEY,checksum TEXT NOT NULL,applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    for (let index = 0; index < statements.length; index += 1) {
      const statement = statements[index];
      const checksum = crypto.createHash('sha256').update(statement).digest('hex');
      const id = `${service}-${String(index + 1).padStart(4, '0')}-${checksum.slice(0, 12)}`;
      const exists = await client.query(`SELECT 1 FROM drizzle_migrations WHERE id=$1`, [id]);
      if (exists.rowCount) continue;
      await client.query('BEGIN');
      try {
        await client.query(statement);
        await client.query(`INSERT INTO drizzle_migrations(id,checksum) VALUES($1,$2)`, [id, checksum]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`${service} migration ${index + 1}: ${error.message}`);
      }
    }
    console.log(JSON.stringify({ service, database, migrations: statements.length, status: 'ready' }));
  } finally {
    await client.end();
  }
}

for (const [service, database] of Object.entries(services)) {
  await migrateService(service, database);
}
