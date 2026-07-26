const { Controller, Get, Inject, Module, Req, Res, ValidationPipe } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { SwaggerModule, DocumentBuilder } = require('@nestjs/swagger');
const { HealthCheckService, TerminusModule } = require('@nestjs/terminus');
const { LoggerModule, Logger: PinoNestLogger } = require('nestjs-pino');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const { client } = require('@techzone/observability/metrics');
const { contextMiddleware } = require('@techzone/observability/context');
const { metricsMiddleware } = require('@techzone/observability/metrics');
const logger = require('@techzone/observability/logger');
const { StandardExceptionFilter } = require('@techzone/config/errors');
const { startTelemetry, stopTelemetry } = require('@techzone/observability/otel');
const { hit } = require('@techzone/auth-platform/rate-limit');

function createPlatformModule(service, readiness) {
  class PlatformController {
    constructor(health) {
      this.health = health;
    }
    live() { return { service, status: 'ok', uptime: process.uptime() }; }
    async ready(response) {
      try {
        const result = await this.health.check([
          async () => {
            const checks = readiness ? await readiness() : { runtime: 'ok' };
            return { dependencies: { status: 'up', ...checks } };
          },
        ]);
        return response.status(200).json({ service, status: 'ready', checks: result.details });
      } catch (error) {
        return response.status(503).json({ service, status: 'not_ready', code: 'DEPENDENCY_UNAVAILABLE', message: error.message });
      }
    }
    async metrics(response) {
      response.setHeader('content-type', client.register.contentType);
      return response.send(await client.register.metrics());
    }
    async reliability(request, response) {
      if (request.headers['x-internal-key'] !== (process.env.INTERNAL_API_KEY || 'techzone-internal')) {
        return response.status(403).json({ code: 'INTERNAL_ACCESS_REQUIRED' });
      }
      const { reliabilitySnapshot } = require('@techzone/messaging/bus');
      return response.json(await reliabilitySnapshot(request.query.limit));
    }
  }
  Controller()(PlatformController);
  Inject(HealthCheckService)(PlatformController, undefined, 0);
  Get('/health')(PlatformController.prototype, 'live', Object.getOwnPropertyDescriptor(PlatformController.prototype, 'live'));
  Get('/health/live')(PlatformController.prototype, 'live', Object.getOwnPropertyDescriptor(PlatformController.prototype, 'live'));
  Get('/health/ready')(PlatformController.prototype, 'ready', Object.getOwnPropertyDescriptor(PlatformController.prototype, 'ready'));
  Res()(PlatformController.prototype, 'ready', 0);
  Get('/metrics')(PlatformController.prototype, 'metrics', Object.getOwnPropertyDescriptor(PlatformController.prototype, 'metrics'));
  Res()(PlatformController.prototype, 'metrics', 0);
  Get('/internal/operations/reliability')(PlatformController.prototype, 'reliability', Object.getOwnPropertyDescriptor(PlatformController.prototype, 'reliability'));
  Req()(PlatformController.prototype, 'reliability', 0);
  Res()(PlatformController.prototype, 'reliability', 1);

  class ApplicationService {}
  class DomainRepository {}
  class ServiceModule {}
  Module({
    imports: [TerminusModule],
    controllers: [PlatformController],
    providers: [ApplicationService, DomainRepository],
  })(ServiceModule);
  Object.defineProperty(ServiceModule, 'name', { value: `${service[0].toUpperCase()}${service.slice(1)}Module` });
  return ServiceModule;
}

function createRootModule(featureModule, service, readiness) {
  const PlatformModule = createPlatformModule(service, readiness);
  class RootModule {}
  const StructuredLoggerModule = LoggerModule.forRoot({
    pinoHttp: {
      autoLogging: false,
      level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'password',
          'refreshToken',
          'accessToken',
          'phone',
          'email',
        ],
        censor: '[REDACTED]',
      },
    },
  });
  Module({ imports: [StructuredLoggerModule, PlatformModule, featureModule] })(RootModule);
  return RootModule;
}

function configureHttp(app, service) {
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') || true,
    credentials: true,
    exposedHeaders: ['x-request-id', 'x-correlation-id', 'x-csrf-token'],
  });
  app.use(cookieParser());
  app.use(contextMiddleware(service));
  app.use(metricsMiddleware(service));
  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => logger.info('http.request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
      userId: req.user?.sub,
    }));
    next();
  });
  app.use(async (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (req.path.startsWith('/health') || req.path === '/metrics') return next();
    const internalKey = req.headers['x-internal-key'];
    if (internalKey && internalKey === (process.env.INTERNAL_API_KEY || 'techzone-internal')) {
      return next();
    }
    const limit = await hit(`rate:${service}:${req.ip}`, {
      limit: Number(process.env.RATE_LIMIT_PER_MINUTE || 120),
      windowSeconds: 60,
      lockSeconds: 60,
    });
    res.setHeader('X-RateLimit-Remaining', String(limit.remaining));
    if (!limit.allowed) {
      return res.status(429).set('Retry-After', String(limit.retryAfter)).json({
        code: 'RATE_LIMITED',
        message: '요청이 너무 많습니다.',
        requestId: req.requestId,
        retryAfter: limit.retryAfter,
        timestamp: new Date().toISOString(),
      });
    }
    next();
  });
}

async function bootstrapNest({ module: featureModule, service, port, readiness, docsPath = '/docs' }) {
  await startTelemetry(service);
  if (!featureModule) throw new Error(`Nest feature module is required for ${service}`);
  let shuttingDown = false;
  const guardedReadiness = async () => {
    if (shuttingDown) throw new Error('Service is shutting down');
    if (readiness) return readiness();
    const { databaseReadiness } = require('@techzone/database/db');
    const { messagingReadiness } = require('@techzone/messaging/bus');
    const { rateLimitReadiness } = require('@techzone/auth-platform/rate-limit');
    const [databases, messaging, rateLimit] = await Promise.all([
      databaseReadiness(),
      messagingReadiness(),
      rateLimitReadiness(),
    ]);
    return { runtime: 'ok', ...databases, ...messaging, ...rateLimit };
  };
  const rootModule = createRootModule(featureModule, service, guardedReadiness);
  const app = await NestFactory.create(rootModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(PinoNestLogger));
  configureHttp(app, service);
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  app.useGlobalFilters(new StandardExceptionFilter());
  app.enableShutdownHooks();
  const config = new DocumentBuilder().setTitle(`TECHZONE ${service}`).setVersion('1.0').addBearerAuth().build();
  SwaggerModule.setup(docsPath, app, SwaggerModule.createDocument(app, config));
  await app.listen(port, '0.0.0.0');
  const shutdown = async signal => {
    shuttingDown = true;
    console.log(JSON.stringify({ level: 'info', service, message: 'shutdown.started', signal }));
    const { close } = require('@techzone/messaging/bus');
    const { closeDatabases } = require('@techzone/database/db');
    const { closeRateLimit } = require('@techzone/auth-platform/rate-limit');
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

module.exports = { bootstrapNest, createPlatformModule, createRootModule, configureHttp };
