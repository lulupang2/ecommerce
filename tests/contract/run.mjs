import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { envelope } = require('../backend/shared/bus');
const openapi = JSON.parse(await fs.readFile(new URL('../contracts/openapi.json', import.meta.url), 'utf8'));
const schema = JSON.parse(await fs.readFile(new URL('../contracts/event-envelope.schema.json', import.meta.url), 'utf8'));

assert.equal(openapi.openapi, '3.1.0');
assert.ok(openapi.paths['/auth/login']);
assert.ok(openapi.paths['/orders'].post.parameters.some(parameter => parameter.$ref?.includes('IdempotencyKey')));
assert.deepEqual(schema.required.sort(), ['actorId', 'causationId', 'correlationId', 'id', 'occurredAt', 'payload', 'requestId', 'schemaVersion', 'source', 'type'].sort());

const event = envelope('order.created', { orderId: crypto.randomUUID() }, { source: 'contract-test' });
for (const property of schema.required) assert.ok(Object.hasOwn(event, property), `event envelope requires ${property}`);
assert.equal(event.schemaVersion, 1);
assert.match(event.id, /^[0-9a-f-]{36}$/);
assert.equal(event.type, 'order.created');
assert.ok(Date.parse(event.occurredAt));
console.log(JSON.stringify({ status: 'passed', openapiPaths: Object.keys(openapi.paths).length, eventSchemaVersion: event.schemaVersion }));
