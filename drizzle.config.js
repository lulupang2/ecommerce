const { defineConfig } = require('drizzle-kit');

module.exports = defineConfig({
  dialect: 'postgresql',
  schema: './backend/shared/schema.js',
  out: './infra/drizzle',
  dbCredentials: { url: process.env.DATABASE_URL || 'postgres://canvas:canvas@localhost:5432/catalog' },
});
