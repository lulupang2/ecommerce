const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { envelope } = require('../../backend/shared/bus');
const { publicJwks, signAccessToken } = require('../../backend/platform/tokens');
const { redact } = require('../../backend/platform/logger');

test('event envelope carries v1 correlation metadata', () => {
  const event = envelope('order.created', { orderId: crypto.randomUUID() }, { source: 'unit', correlationId: 'correlation-1' });
  assert.equal(event.schemaVersion, 1);
  assert.equal(event.correlationId, 'correlation-1');
  assert.equal(event.source, 'unit');
  assert.match(event.id, /^[0-9a-f-]{36}$/);
});

test('access token is RS256, short-lived and verifiable through JWKS', () => {
  const token = signAccessToken({ sub: crypto.randomUUID(), role: 'customer' });
  const decoded = jwt.decode(token, { complete: true });
  assert.equal(decoded.header.alg, 'RS256');
  assert.ok(decoded.payload.exp - decoded.payload.iat <= 15 * 60);
  const jwk = publicJwks().keys.find(key => key.kid === decoded.header.kid);
  const verified = jwt.verify(token, crypto.createPublicKey({ key: jwk, format: 'jwk' }), {
    algorithms: ['RS256'], issuer: 'techzone-auth', audience: 'techzone-api',
  });
  assert.equal(verified.role, 'customer');
});

test('structured log fields redact credentials recursively', () => {
  assert.deepEqual(redact({ password: 'secret', nested: { refreshToken: 'token' }, safe: 'ok' }), {
    password: '[REDACTED]', nested: { refreshToken: '[REDACTED]' }, safe: 'ok',
  });
});
