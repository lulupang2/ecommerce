const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

test('generated demo environment passes deployment validation without exposing defaults', async () => {
  const { generateDeploymentEnv, validateDeploymentEnv } = await import('../../tools/deployment/config.mjs');
  const values = generateDeploymentEnv({ domain: 'demo.techzone.kr', email: 'owner@techzone.kr' });

  assert.deepEqual(validateDeploymentEnv(values), []);
  assert.equal(values.PUBLIC_BIND_ADDRESS, '127.0.0.1');
  assert.equal(values.MANAGEMENT_BIND_ADDRESS, '127.0.0.1');
  assert.notEqual(values.ADMIN_PASSWORD, 'TechzoneAdmin123!');
  assert.match(values.AUTH_PRIVATE_KEY_BASE64, /^[A-Za-z0-9+/=]+$/);
});

test('deployment validation rejects placeholders and public management ports', async () => {
  const { parseEnv, validateDeploymentEnv } = await import('../../tools/deployment/config.mjs');
  const values = parseEnv(`
NODE_ENV=production
DEPLOYMENT_ENVIRONMENT=demo
DEMO_DOMAIN=demo.your-domain.com
PUBLIC_BIND_ADDRESS=0.0.0.0
MANAGEMENT_BIND_ADDRESS=0.0.0.0
ADMIN_PASSWORD=CHANGE_ME
`);
  const errors = validateDeploymentEnv(values);

  assert.ok(errors.some(error => error.startsWith('DEMO_DOMAIN')));
  assert.ok(errors.some(error => error.startsWith('ADMIN_PASSWORD')));
  assert.ok(errors.some(error => error.startsWith('MANAGEMENT_BIND_ADDRESS')));
});

test('compose provisions public media storage before the media service starts', () => {
  const compose = yaml.load(fs.readFileSync(path.resolve('docker-compose.yml'), 'utf8'));
  const minio = compose.services.minio;
  const initializer = compose.services['minio-init'];
  const media = compose.services.media;

  assert.equal(
    minio.environment.MINIO_API_CORS_ALLOW_ORIGIN,
    '${CORS_ORIGIN:-http://localhost:15173}',
  );
  assert.match(initializer.command[0], /mc mb --ignore-existing local\/techzone-media/);
  assert.match(initializer.command[0], /mc anonymous set download local\/techzone-media/);
  assert.deepEqual(initializer.depends_on.minio, { condition: 'service_healthy' });
  assert.deepEqual(media.depends_on['minio-init'], { condition: 'service_completed_successfully' });
});
