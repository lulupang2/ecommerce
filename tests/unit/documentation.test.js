const test = require('node:test');
const assert = require('node:assert/strict');

test('portfolio documentation has valid local links and npm commands', async () => {
  const { validateDocumentation } = await import('../../tools/validation/docs.mjs');
  const result = await validateDocumentation();

  assert.deepEqual(result.errors, []);
  assert.ok(result.filesChecked >= 10);
  assert.ok(result.linksChecked >= 10);
  assert.ok(result.commandsChecked >= 10);
});
