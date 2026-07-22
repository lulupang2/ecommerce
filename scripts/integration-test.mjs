import assert from 'node:assert/strict';

const base = process.env.API_BASE || 'http://localhost:18080/api';
async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, { headers: { 'content-type': 'application/json' }, ...options });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  assert.ok(response.ok, `${options.method || 'GET'} ${path}: ${JSON.stringify(data)}`);
  return data;
}

const email = `test-${Date.now()}@canvas.local`;
for (const service of ['auth', 'catalog', 'cart', 'order', 'payment', 'inventory', 'notification', 'search', 'media']) {
  const health = await request(`/health/${service}`);
  assert.equal(health.status, 'ok', `${service} must be healthy`);
}
const account = await request('/auth/register', { method: 'POST', body: JSON.stringify({ email, password: 'Canvas1234!', name: 'Integration Test' }) });
assert.ok(account.accessToken);
const login = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password: 'Canvas1234!' }) });
assert.equal(login.user.id, account.user.id);
const profile = await request('/auth/me', { headers: { 'content-type': 'application/json', authorization: `Bearer ${login.accessToken}` } });
assert.equal(profile.email, email);
const catalog = await request('/products');
assert.ok(catalog.items.length >= 8, 'seed catalog must contain products');
const product = catalog.items[0];
const search = await request('/search?q=orbit');
assert.ok(search.items.some(item => item.name.toLowerCase().includes('orbit')));
const media = await request('/media/upload-url', { method: 'POST', body: JSON.stringify({ ownerId: account.user.id, fileName: 'integration.jpg' }) });
assert.ok(media.assetId && media.publicUrl);
await request(`/carts/${account.user.id}/items`, { method: 'POST', body: JSON.stringify({ productId: product.id, name: product.name, brand: product.brand, image: product.image, price: product.price, quantity: 1 }) });
const cart = await request(`/carts/${account.user.id}`);
assert.equal(cart.items.length, 1);
const order = await request('/orders', { method: 'POST', body: JSON.stringify({ userId: account.user.id, items: [{ productId: product.id, name: product.name, brand: product.brand, image: product.image, price: product.price, quantity: 1 }], shipping: { recipient: 'Integration Test', phone: '010-0000-0000', address: 'Seoul, Korea' } }) });
let result;
for (let attempt = 0; attempt < 12; attempt += 1) {
  await new Promise(resolve => setTimeout(resolve, 500));
  result = await request(`/orders/${order.id}`);
  if (result.status === 'confirmed') break;
}
assert.equal(result.status, 'confirmed', 'order saga must confirm the order');
const orderHistory = await request(`/orders?userId=${account.user.id}`);
assert.ok(orderHistory.items.some(item => item.id === order.id), 'created order must appear in order history');
const notifications = await request(`/notifications/${account.user.id}`);
assert.ok(notifications.items.length > 0, 'confirmed order must generate a notification');
console.log(JSON.stringify({ status: 'passed', userId: account.user.id, orderNumber: result.order_number, products: catalog.items.length }));
