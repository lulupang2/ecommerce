import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const base = process.env.API_BASE || 'http://127.0.0.1:18080/api';
const docker = process.platform === 'win32' ? 'docker.exe' : 'docker';
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  assert.ok(response.ok, `${path}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}

async function compose(...args) {
  await exec(docker, ['compose', ...args], { cwd: process.cwd(), timeout: 120_000 });
}

async function serviceReady(service, attempts = 90) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(`${base}/health/${service}`);
      if (response.ok) return;
    } catch {}
    await wait(1_000);
  }
  assert.fail(`${service} 서비스가 제한 시간 안에 복구되지 않았습니다.`);
}

async function serviceUnavailable(service) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await fetch(`${base}/health/${service}`);
      if (!response.ok) return;
    } catch {
      return;
    }
    await wait(500);
  }
  assert.fail(`${service} 중단이 readiness에 반영되지 않았습니다.`);
}

const stopped = new Set();
async function stop(service) {
  await compose('stop', service);
  stopped.add(service);
}
async function start(service) {
  await compose('start', service);
  stopped.delete(service);
}

try {
  // Downstream process and DB failures must be reflected by readiness and recover without recreation.
  await stop('order');
  await serviceUnavailable('order');
  await start('order');
  await serviceReady('order');

  await stop('inventory');
  await serviceUnavailable('inventory');
  await start('inventory');
  await serviceReady('inventory');

  await stop('postgres');
  await serviceUnavailable('order');
  await start('postgres');
  await serviceReady('order');
  await serviceReady('inventory');

  // Previous suites intentionally exercise the shared limiter heavily.
  await compose('exec', '-T', 'redis', 'redis-cli', 'FLUSHDB');
  const products = await request('/products?pageSize=1');
  const product = products.items[0];
  assert.ok(product, '복구 테스트용 상품이 필요합니다.');
  const detail = await request(`/products/by-slug/${product.slug}`);
  const quote = await request('/checkout/quote', {
    method: 'POST',
    body: JSON.stringify({ items: [{ variantId: detail.variants[0].id, quantity: 1 }] }),
  });

  await stop('rabbitmq');
  const order = await request('/orders', {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({
      userId: crypto.randomUUID(),
      quoteToken: quote.quoteToken,
      guestOrder: true,
      paymentMethod: 'card',
      shipping: {
        recipient: '장애 복구 테스트',
        phone: '010-1111-2222',
        address: '서울특별시 강남구 테헤란로 1',
      },
    }),
  });
  assert.ok(order.id, 'RabbitMQ 중단 중에도 주문 transaction과 outbox 기록은 성공해야 합니다.');

  // Simulate an abrupt writer-process exit after its transaction commits.
  await compose('kill', 'order');
  stopped.add('order');
  await start('order');
  await serviceReady('order');
  await start('rabbitmq');

  const access = await request('/orders/guest/access', {
    method: 'POST',
    body: JSON.stringify({ orderNumber: order.orderNumber, phone: '01011112222' }),
  });
  let recovered;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    await wait(1_000);
    recovered = await request(`/orders/guest/${order.id}`, {
      headers: { authorization: `Bearer ${access.accessToken}` },
    });
    if (['confirmed', 'preparing'].includes(recovered.status)) break;
  }
  assert.ok(
    ['confirmed', 'preparing'].includes(recovered?.status),
    'RabbitMQ 복구 후 outbox가 발행되고 Saga가 재개되어야 합니다.',
  );

  console.log(JSON.stringify({
    status: 'passed',
    failures: ['order', 'inventory', 'postgres', 'rabbitmq', 'order-process-crash'],
    orderNumber: order.orderNumber,
    recoveredStatus: recovered.status,
  }));
} finally {
  for (const service of [...stopped].reverse()) {
    await compose('start', service);
  }
}
