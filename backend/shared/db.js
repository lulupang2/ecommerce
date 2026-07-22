const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');

function database(service) {
  const fallback = `postgres://canvas:canvas@localhost:5432/${service}`;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL || fallback });
  return {
    pool,
    orm: drizzle(pool),
    query: (text, values) => pool.query(text, values),
    async wait() {
      for (let i = 0; i < 30; i += 1) {
        try { await pool.query('SELECT 1'); return; } catch { await new Promise(r => setTimeout(r, 1000)); }
      }
      throw new Error(`${service} database unavailable`);
    },
  };
}
module.exports = { database };
