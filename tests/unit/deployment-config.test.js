const test = require('node:test');
const assert = require('node:assert/strict');

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
