const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const pools = new Set();

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function database(service) {
  const fallback = `postgres://canvas:canvas@localhost:5432/${service}`;
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || fallback,
    application_name: `techzone-${process.env.SERVICE_NAME || service}`,
    max: positiveInteger(process.env.PG_POOL_MAX, 12),
    idleTimeoutMillis: positiveInteger(process.env.PG_IDLE_TIMEOUT_MS, 30_000),
    connectionTimeoutMillis: positiveInteger(process.env.PG_CONNECTION_TIMEOUT_MS, 5_000),
    statement_timeout: positiveInteger(process.env.PG_STATEMENT_TIMEOUT_MS, 10_000),
    query_timeout: positiveInteger(process.env.PG_QUERY_TIMEOUT_MS, 12_000),
    keepAlive: true,
  });
  pools.add(pool);
  const query = (text, values) => {
    const normalized = String(text).trim().toUpperCase();
    const isDdl = normalized.startsWith('CREATE ') || normalized.startsWith('ALTER ') || normalized.startsWith('DO $$');
    if (isDdl && process.env.SCHEMA_MANAGED_BY_MIGRATIONS === 'true') return Promise.resolve({ rows: [], rowCount: 0, command: 'SKIP_DDL' });
    return pool.query(text, values);
  };
  return {
    pool,
    orm: drizzle(pool),
    query,
    async wait() {
      for (let i = 0; i < 30; i += 1) {
        try { await pool.query('SELECT 1'); return; } catch { await new Promise(r => setTimeout(r, 1000)); }
      }
      throw new Error(`${service} database unavailable`);
    },
  };
}
async function closeDatabases() {
  await Promise.allSettled([...pools].map(pool => pool.end()));
  pools.clear();
}
async function databaseReadiness() {
  await Promise.all([...pools].map(pool => pool.query('SELECT 1')));
  return { databases: pools.size ? 'ok' : 'not_configured' };
}
module.exports = { database, closeDatabases, databaseReadiness };
