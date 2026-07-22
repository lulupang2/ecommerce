const express = require('express');
const cors = require('cors');
require('reflect-metadata');
const { NestFactory } = require('@nestjs/core');
const { Module } = require('@nestjs/common');

function server(name) {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.get('/health', (_, res) => res.json({ service: name, status: 'ok' }));
  app.use((err, _, res, __) => { console.error(err); res.status(500).json({ code: 'INTERNAL_ERROR', message: err.message }); });
  return app;
}
class LegacyServiceModule {}
Module({})(LegacyServiceModule);
async function listen(app, name) {
  const port = Number(process.env.PORT || 3000);
  const nestApp = await NestFactory.create(LegacyServiceModule, { logger: false });
  nestApp.use(app);
  await nestApp.listen(port, '0.0.0.0');
  console.log(`${name} (NestJS) listening on ${port}`);
}
module.exports = { server, listen };
