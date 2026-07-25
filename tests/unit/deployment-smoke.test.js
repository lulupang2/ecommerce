const test = require('node:test');
const assert = require('node:assert/strict');

test('deployment smoke covers every public surface', async () => {
  const { buildSmokeTargets } = await import('../../tools/deployment/smoke.mjs');
  const targets = buildSmokeTargets('demo.techzone.kr');

  assert.deepEqual(targets, [
    { name: 'gateway', url: 'https://demo.techzone.kr/health/ready' },
    { name: 'storefront', url: 'https://demo.techzone.kr/' },
    { name: 'admin', url: 'https://demo.techzone.kr/admin/' },
    { name: 'media', url: 'https://media.demo.techzone.kr/minio/health/live' },
  ]);
});

test('deployment smoke retries the complete surface and then succeeds', async () => {
  const { runSmokeTest } = await import('../../tools/deployment/smoke.mjs');
  let calls = 0;
  let waits = 0;

  const result = await runSmokeTest({
    domain: 'demo.techzone.kr',
    attempts: 3,
    intervalMs: 0,
    fetchImpl: async url => {
      calls += 1;
      const firstAttemptMedia = calls <= 4 && url.includes('media.');
      return { ok: !firstAttemptMedia, status: firstAttemptMedia ? 503 : 200 };
    },
    wait: async () => { waits += 1; },
  });

  assert.equal(result.status, 'passed');
  assert.equal(result.attemptsUsed, 2);
  assert.equal(calls, 8);
  assert.equal(waits, 1);
});

test('deployment smoke reports the failing public surface', async () => {
  const { runSmokeTest } = await import('../../tools/deployment/smoke.mjs');

  await assert.rejects(
    runSmokeTest({
      domain: 'demo.techzone.kr',
      attempts: 1,
      fetchImpl: async url => ({ ok: !url.includes('/admin/'), status: 502 }),
    }),
    /admin: HTTP 502/,
  );
});
