import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const root = process.cwd();
const services = {
  auth: { database: 'auth', workspace: 'auth' },
  catalog: { database: 'catalog', workspace: 'catalog' },
  cart: { database: 'cart', workspace: 'cart' },
  order: { database: 'orders', workspace: 'order' },
  payment: { database: 'payments', workspace: 'payment' },
  inventory: { database: 'inventory', workspace: 'inventory' },
  notification: { database: 'notifications', workspace: 'notification' },
  search: { database: 'search', workspace: 'search' },
  media: { database: 'media', workspace: 'media' },
  fulfillment: { database: 'fulfillment', workspace: 'fulfillment' },
  procurement: { database: 'procurement', workspace: 'procurement' },
  admin: { database: 'admin', workspace: 'admin-query' },
};

async function migrateService(service, { database, workspace }) {
  const baseline = await fs.readFile(path.join(root, 'apps', 'services', workspace, 'drizzle', '0000_baseline.sql'), 'utf8');
  const reliability = await fs.readFile(path.join(root, 'packages', 'messaging', 'migrations', '0000_reliability.sql'), 'utf8');
  const statements = [
    ...baseline.split('-- statement-breakpoint').map(value => value.trim()).filter(Boolean),
    reliability,
  ];
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

const requested = process.argv.find(argument => argument.startsWith('--service='))?.split('=')[1];
const selected = requested
  ? Object.entries(services).filter(([service, config]) => service === requested || config.workspace === requested)
  : Object.entries(services);
if (!selected.length) throw new Error(`Unknown service migration target: ${requested}`);
for (const [service, config] of selected) {
  await migrateService(service, config);
}
