const { Controller, Get, Module, Res, ValidationPipe } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { SwaggerModule, DocumentBuilder } = require('@nestjs/swagger');
const { client } = require('./metrics');
const { StandardExceptionFilter } = require('./errors');
const { startTelemetry, stopTelemetry } = require('./otel');

function createPlatformModule(service, readiness) {
  class PlatformController {
    live() { return { service, status: 'ok', uptime: process.uptime() }; }
    async ready(response) {
      try {
        const checks = readiness ? await readiness() : { runtime: 'ok' };
        return response.status(200).json({ service, status: 'ready', checks });
      } catch (error) {
        return response.status(503).json({ service, status: 'not_ready', code: 'DEPENDENCY_UNAVAILABLE', message: error.message });
      }
    }
    async metrics(response) {
      response.setHeader('content-type', client.register.contentType);
      return response.send(await client.register.metrics());
    }
  }
  Controller()(PlatformController);
  Get('/health')(PlatformController.prototype, 'live', Object.getOwnPropertyDescriptor(PlatformController.prototype, 'live'));
  Get('/health/live')(PlatformController.prototype, 'live', Object.getOwnPropertyDescriptor(PlatformController.prototype, 'live'));
  Get('/health/ready')(PlatformController.prototype, 'ready', Object.getOwnPropertyDescriptor(PlatformController.prototype, 'ready'));
  Res()(PlatformController.prototype, 'ready', 0);
  Get('/metrics')(PlatformController.prototype, 'metrics', Object.getOwnPropertyDescriptor(PlatformController.prototype, 'metrics'));
  Res()(PlatformController.prototype, 'metrics', 0);

  class ApplicationService {}
  class DomainRepository {}
  class ServiceModule {}
  Module({ controllers: [PlatformController], providers: [ApplicationService, DomainRepository] })(ServiceModule);
  Object.defineProperty(ServiceModule, 'name', { value: `${service[0].toUpperCase()}${service.slice(1)}Module` });
  return ServiceModule;
}

async function bootstrapNest({ router, service, port, readiness }) {
  await startTelemetry(service);
  const ServiceModule = createPlatformModule(service, readiness);
  const app = await NestFactory.create(ServiceModule, { logger: false, bodyParser: false });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  app.useGlobalFilters(new StandardExceptionFilter());
  app.use(router);
  app.enableShutdownHooks();
  const config = new DocumentBuilder().setTitle(`TECHZONE ${service}`).setVersion('1.0').addBearerAuth().build();
  SwaggerModule.setup('/docs', app, SwaggerModule.createDocument(app, config));
  await app.listen(port, '0.0.0.0');
  const shutdown = async signal => {
    console.log(JSON.stringify({ level: 'info', service, message: 'shutdown.started', signal }));
    const { close } = require('../shared/bus');
    const { closeDatabases } = require('../shared/db');
    const { closeRateLimit } = require('./rate-limit');
    await Promise.race([
      Promise.allSettled([close(), closeDatabases(), closeRateLimit()]),
      new Promise(resolve => setTimeout(resolve, 25_000)),
    ]);
    await app.close();
    await stopTelemetry();
    process.exit(0);
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
  return app;
}

module.exports = { bootstrapNest, createPlatformModule };
