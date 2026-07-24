import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const services = [
  ['api-gateway', 'api-gateway', 'ApiGateway'],
  ['services/auth', 'auth', 'Auth'],
  ['services/catalog', 'catalog', 'Catalog'],
  ['services/cart', 'cart', 'Cart'],
  ['services/order', 'order', 'Order'],
  ['services/payment', 'payment', 'Payment'],
  ['services/inventory', 'inventory', 'Inventory'],
  ['services/notification', 'notification', 'Notification'],
  ['services/search', 'search', 'Search'],
  ['services/media', 'media', 'Media'],
  ['services/fulfillment', 'fulfillment', 'Fulfillment'],
  ['services/procurement', 'procurement', 'Procurement'],
  ['services/admin-query', 'admin-query', 'AdminQuery'],
];
const serviceDependencies = {
  'api-gateway': { 'swagger-ui-express': '^5.0.1' },
  auth: { bcryptjs: '^3.0.2', 'drizzle-orm': '^0.45.2' },
  catalog: { 'sanitize-html': '^2.17.6' },
  fulfillment: { jsonwebtoken: '^9.0.2' },
  inventory: { 'drizzle-orm': '^0.45.2' },
  media: {
    '@aws-sdk/client-s3': '^3.1093.0',
    '@aws-sdk/s3-request-presigner': '^3.1093.0',
    'drizzle-orm': '^0.45.2',
  },
  notification: { 'drizzle-orm': '^0.45.2' },
  order: { 'drizzle-orm': '^0.45.2', jsonwebtoken: '^9.0.2' },
  payment: { 'drizzle-orm': '^0.45.2' },
};

for (const [relative, packageName, className] of services) {
  const app = path.join(root, 'apps', relative);
  for (const directory of [
    'src/presentation',
    'src/application',
    'src/domain',
    'src/infrastructure/persistence',
    'src/infrastructure/messaging',
    'src/infrastructure/providers',
    'drizzle',
    'seeds',
    'test',
  ]) await mkdir(path.join(app, directory), { recursive: true });

  await writeFile(path.join(app, 'package.json'), `${JSON.stringify({
    name: `@techzone/${packageName}`,
    version: '0.1.0',
    private: true,
    type: 'commonjs',
    scripts: {
      dev: 'node --watch src/main.cjs',
      start: 'node src/main.cjs',
      build: 'tsc',
      lint: 'tsc --noEmit',
      typecheck: 'tsc --noEmit',
      test: 'node --test',
      migrate: `node ${relative === 'api-gateway' ? '../../' : '../../../'}tools/migrations/run.mjs --service=${packageName}`,
    },
    dependencies: {
      '@techzone/auth-platform': '*',
      '@techzone/config': '*',
      '@techzone/contracts': '*',
      '@techzone/database': '*',
      '@techzone/messaging': '*',
      '@techzone/observability': '*',
      '@nestjs/common': '^11.1.28',
      ...(serviceDependencies[packageName] ?? {}),
    },
    devDependencies: {
      '@techzone/tsconfig': '*',
      '@types/node': '^22.19.0',
      typescript: '^5.9.3',
    },
  }, null, 2)}\n`);
  await writeFile(path.join(app, 'tsconfig.json'), `${JSON.stringify({
    extends: '@techzone/tsconfig/nest.json',
    compilerOptions: { rootDir: 'src', outDir: 'dist', noEmit: false },
    include: ['src/**/*.ts'],
  }, null, 2)}\n`);
  await writeFile(path.join(app, 'src/domain/service-name.ts'), `export const SERVICE_NAME = '${packageName}' as const;\n`);
  await writeFile(path.join(app, 'src/application/service.ts'), `import { Injectable } from '@nestjs/common';\nimport { SERVICE_NAME } from '../domain/service-name';\n\n@Injectable()\nexport class ${className}ApplicationService {\n  describe() { return { service: SERVICE_NAME, architecture: 'module-controller-service-repository' as const }; }\n}\n`);
  await writeFile(path.join(app, 'src/presentation/architecture.controller.ts'), `import { Controller, Get } from '@nestjs/common';\nimport { ${className}ApplicationService } from '../application/service';\n\n@Controller('_architecture')\nexport class ${className}ArchitectureController {\n  constructor(private readonly application: ${className}ApplicationService) {}\n  @Get() describe() { return this.application.describe(); }\n}\n`);
  await writeFile(path.join(app, 'src/infrastructure/persistence/repository.ts'), `import { Injectable } from '@nestjs/common';\n\n@Injectable()\nexport class ${className}Repository {\n  readonly owner = '${packageName}';\n}\n`);
  await writeFile(path.join(app, 'src/app.module.ts'), `import { Module } from '@nestjs/common';\nimport { ${className}ApplicationService } from './application/service';\nimport { ${className}ArchitectureController } from './presentation/architecture.controller';\nimport { ${className}Repository } from './infrastructure/persistence/repository';\n\n@Module({ controllers: [${className}ArchitectureController], providers: [${className}ApplicationService, ${className}Repository] })\nexport class ${className}Module {}\n`);
  await writeFile(path.join(app, 'src/infrastructure/messaging/README.md'), '# Messaging adapters\n\nOutbox publishers and inbox event handlers owned by this service belong here.\n');
  await writeFile(path.join(app, 'src/infrastructure/providers/README.md'), '# Provider adapters\n\nExternal provider adapters owned by this service belong here.\n');
  await writeFile(path.join(app, 'drizzle/README.md'), '# Service migrations\n\nThis directory is the only migration ownership boundary for this service.\n');
  await writeFile(path.join(app, 'seeds/README.md'), '# Service seeds\n\nSeeds run only from explicit development or test commands.\n');

  const runtime = await readFile(path.join(app, 'src/main.cjs'), 'utf8');
  const statements = [...runtime.matchAll(/db\.query\(`([\s\S]*?)`(?:,\s*\[[\s\S]*?\])?\)/g)]
    .map(match => match[1].trim())
    .filter(sql => !sql.includes('${') && /^(CREATE|ALTER|DO \$\$)/i.test(sql));
  await writeFile(
    path.join(app, 'drizzle/0000_baseline.sql'),
    `-- Adoptable baseline for the existing ${packageName} database.\n${statements.map(sql => `${sql};`).join('\n\n-- statement-breakpoint\n\n')}\n`,
  );
}
