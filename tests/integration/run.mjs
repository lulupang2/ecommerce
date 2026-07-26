import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const base = process.env.API_BASE || 'http://127.0.0.1:18080/api';
async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  assert.ok(response.ok, `${options.method || 'GET'} ${path}: ${JSON.stringify(data)}`);
  return data;
}

const email = `test-${Date.now()}@canvas.local`;
for (const service of ['auth', 'catalog', 'cart', 'order', 'payment', 'inventory', 'notification', 'search', 'media', 'fulfillment', 'procurement', 'admin']) {
  const health = await request(`/health/${service}`);
  assert.ok(['ok', 'ready'].includes(health.status), `${service} must be healthy`);
}
const account = await request('/auth/register', { method: 'POST', body: JSON.stringify({ email, password: 'Canvas1234!', name: 'Integration Test' }) });
assert.ok(account.accessToken);
const login = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password: 'Canvas1234!' }) });
assert.equal(login.user.id, account.user.id);
const profile = await request('/auth/me', { headers: { 'content-type': 'application/json', authorization: `Bearer ${login.accessToken}` } });
const userHeaders = { 'content-type': 'application/json', authorization: `Bearer ${login.accessToken}` };
assert.equal(profile.email, email);
assert.equal(account.user.role, 'customer', 'public registration must not assign admin role');
const forbidden = await fetch(`${base}/orders`, { headers: { authorization: `Bearer ${login.accessToken}` } });
assert.equal(forbidden.status, 403, 'customer must not access admin order list');
const adminLogin = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email: process.env.ADMIN_EMAIL || 'admin@techzone.local', password: process.env.ADMIN_PASSWORD || 'TechzoneAdmin123!' }) });
assert.equal(adminLogin.user.role, 'admin');
const adminHeaders = { 'content-type': 'application/json', authorization: `Bearer ${adminLogin.accessToken}` };
const adminUsers = await request('/auth/users', { headers: adminHeaders });
assert.ok(adminUsers.items.some(user => user.email === (process.env.ADMIN_EMAIL || 'admin@techzone.local')), 'admin member list must include seeded admin');
const roles = await request('/admin/roles', { headers: adminHeaders });
assert.ok(roles.items.some(role => role.code === 'super_admin'), 'RBAC roles must be seeded');
const catalog = await request('/products');
assert.ok(catalog.items.length >= 8, 'seed catalog must contain products');
const product = catalog.items[0];
const productDetail = await request(`/products/${product.id}`);
assert.equal(productDetail.id, product.id, 'product detail must resolve by id');
assert.ok(productDetail.variants.some(variant => variant.availableQty > 0), 'product variants must expose available inventory');
const adminCatalog = await request('/products?status=all', { headers: adminHeaders });
assert.ok(adminCatalog.items.length >= catalog.items.length, 'admin catalog must include products');
const originalPrice = productDetail.price;
await request(`/products/${product.id}`, { method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ price: originalPrice + 1 }) });
await request(`/products/${product.id}`, { method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ price: originalPrice }) });
const inventoryBefore = await request(`/inventory/${product.id}`);
const inventoryList = await request('/inventory', { headers: adminHeaders });
assert.ok(Array.isArray(inventoryList.items), 'admin inventory list must be available');
await request(`/inventory/${product.id}`, { method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ availableQty: inventoryBefore.available_qty, reason: 'integration inventory verification' }) });
const search = await request('/search?q=orbit');
assert.ok(search.items.some(item => item.name.toLowerCase().includes('orbit')));
const media = await request('/media/upload-url', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ fileName: 'integration.jpg' }) });
assert.ok(media.assetId && media.publicUrl);
assert.equal(media.storage, 's3', 'Docker media storage must use MinIO/S3');
const mediaUpload = await fetch(media.uploadUrl, {
  method: 'PUT',
  headers: { 'content-type': 'image/jpeg' },
  body: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
});
assert.equal(mediaUpload.status, 200, 'presigned media upload URL must accept the object');
const mediaRead = await fetch(media.publicUrl);
assert.equal(mediaRead.status, 200, 'uploaded product media must be publicly readable');
assert.equal((await mediaRead.arrayBuffer()).byteLength, 4);
const forbiddenMedia = await fetch(`${base}/media/upload-url`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${login.accessToken}` }, body: JSON.stringify({ fileName: 'forbidden.jpg' }) });
assert.equal(forbiddenMedia.status, 403, 'customer must not issue media upload URL');
await request(`/carts/${account.user.id}/items`, { method: 'POST', headers: userHeaders, body: JSON.stringify({ productId: product.id, name: product.name, brand: product.brand, image: product.image, price: product.price, quantity: 1 }) });
const cart = await request(`/carts/${account.user.id}`, { headers: userHeaders });
assert.equal(cart.items.length, 1);
assert.equal(cart.items[0].price, product.price, 'cart must store the canonical server price');
assert.equal(cart.items[0].in_stock, true, 'cart must expose variant stock status');
const tamperedCart = await request(`/carts/${account.user.id}/items`, {
  method: 'POST',
  headers: userHeaders,
  body: JSON.stringify({
    productId: product.id,
    variantId: productDetail.variants.find(variant => variant.availableQty > 0).id,
    name: '조작된 상품명',
    brand: '조작된 브랜드',
    image: product.image,
    price: 1,
    quantity: 1,
  }),
});
assert.equal(tamperedCart.quantity, 1);
const canonicalCart = await request(`/carts/${account.user.id}`, { headers: userHeaders });
assert.equal(canonicalCart.items[0].name, product.name, 'cart must ignore client supplied product metadata');
assert.equal(canonicalCart.items[0].price, product.price, 'cart must ignore client supplied price');
const orderKey = crypto.randomUUID();
const order = await request('/orders', { method: 'POST', headers: { ...userHeaders, 'idempotency-key': orderKey }, body: JSON.stringify({ userId: account.user.id, items: [{ productId: product.id, name: product.name, brand: product.brand, image: product.image, price: product.price, quantity: 1 }], shipping: { recipient: 'Integration Test', phone: '010-0000-0000', address: 'Seoul, Korea' } }) });
const replayedOrder = await request('/orders', { method: 'POST', headers: { ...userHeaders, 'idempotency-key': orderKey }, body: JSON.stringify({ userId: account.user.id, items: [{ productId: product.id, name: product.name, brand: product.brand, image: product.image, price: product.price, quantity: 1 }], shipping: { recipient: 'Integration Test', phone: '010-0000-0000', address: 'Seoul, Korea' } }) });
assert.equal(replayedOrder.id, order.id, 'same Idempotency-Key must replay the original order');
const payment = await request('/payments/confirm', { method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify({ orderId: order.id, amount: order.totalAmount, paymentKey: `integration_${order.id}`, order: { userId: account.user.id, items: [{ productId: product.id, name: product.name, brand: product.brand, image: product.image, price: product.price, quantity: 1 }] } }) });
assert.equal(payment.status, 'approved');
let result;
for (let attempt = 0; attempt < 12; attempt += 1) {
  await new Promise(resolve => setTimeout(resolve, 500));
  result = await request(`/orders/${order.id}`, { headers: userHeaders });
  if (['confirmed', 'preparing'].includes(result.status)) break;
}
assert.ok(['confirmed', 'preparing'].includes(result.status), 'order saga must confirm the order and may immediately advance to fulfillment');
const orderHistory = await request(`/orders?userId=${account.user.id}`, { headers: userHeaders });
assert.ok(orderHistory.items.some(item => item.id === order.id), 'created order must appear in order history');
const adminOrders = await request('/orders', { headers: adminHeaders });
assert.ok(adminOrders.items.some(item => item.id === order.id), 'admin order list must include created order');
let shipment;
for (let attempt = 0; attempt < 12; attempt += 1) {
  await new Promise(resolve => setTimeout(resolve, 500));
  const shipmentPage = await request('/admin/shipments?page=1&pageSize=100', { headers: adminHeaders });
  shipment = shipmentPage.items.find(item => item.order_id === order.id);
  if (shipment) break;
}
assert.ok(shipment, 'confirmed order must create a shipment');
await request(`/fulfillment/shipments/${shipment.shipment_id}/status`, { method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ status: 'packed', reason: 'integration packing' }) });
await request(`/fulfillment/shipments/${shipment.shipment_id}/status`, { method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ status: 'shipped', trackingNumber: `TEST${Date.now()}`, reason: 'integration shipping' }) });
await request(`/fulfillment/shipments/${shipment.shipment_id}/status`, { method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ status: 'delivered', reason: 'integration delivered' }) });
for (let attempt = 0; attempt < 10; attempt += 1) {
  await new Promise(resolve => setTimeout(resolve, 250));
  const delivered = await request(`/orders/${order.id}`, { headers: userHeaders });
  if (delivered.status === 'delivered') break;
}
const review = await request(`/products/${product.id}/reviews`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${login.accessToken}` }, body: JSON.stringify({ rating: 5, body: '통합 테스트 구매 인증 리뷰' }) });
assert.equal(review.status, 'pending', 'delivered purchaser may submit a review for moderation');
const createdReturn = await request('/fulfillment/returns', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ orderId: order.id, reason: 'integration return', refundAmount: order.totalAmount }) });
await request(`/fulfillment/returns/${createdReturn.id}/status`, { method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ status: 'approved', reason: 'integration approved' }) });
await request(`/fulfillment/returns/${createdReturn.id}/status`, { method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ status: 'received', reason: 'integration received' }) });
const refund = await request(`/fulfillment/returns/${createdReturn.id}/refund`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ amount: order.totalAmount, reason: 'integration refund' }) });
assert.equal(refund.status, 'refunded', 'received return must be refunded');
const notifications = await request(`/notifications/${account.user.id}`, { headers: userHeaders });
assert.ok(notifications.items.length > 0, 'confirmed order must generate a notification');
await request(`/carts/${account.user.id}`, { method: 'DELETE', headers: userHeaders });
const clearedCart = await request(`/carts/${account.user.id}`, { headers: userHeaders });
assert.equal(clearedCart.items.length, 0, 'cart must clear after checkout');
const rebuilt = await request('/admin/rebuild', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ reason: 'integration rebuild' }) });
assert.ok(rebuilt.orders > 0 && rebuilt.products >= 8, 'admin read model must rebuild from source services');
const dashboard = await request('/admin/dashboard', { headers: adminHeaders });
assert.ok(dashboard.kpis && Array.isArray(dashboard.trend), 'admin dashboard projection must return KPI and trend');
const adminProductPage = await request('/admin/products?page=1&pageSize=10&sort=price&direction=desc', { headers: adminHeaders });
assert.equal(adminProductPage.pageSize, 10, 'admin tables must use server pagination');
const auditLogs = await request('/admin/audit-logs?page=1&pageSize=100', { headers: adminHeaders });
assert.ok(auditLogs.items.some(item => item.action === 'admin.projection_rebuilt'), 'admin mutation must create audit log');
await request(`/auth/users/${account.user.id}/role`, { method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ role: 'viewer' }) });
const viewerLogin = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password: 'Canvas1234!' }) });
const viewerHeaders = { 'content-type': 'application/json', authorization: `Bearer ${viewerLogin.accessToken}` };
await request('/admin/dashboard', { headers: viewerHeaders });
const viewerMutation = await fetch(`${base}/products/${product.id}`, { method: 'PATCH', headers: viewerHeaders, body: JSON.stringify({ price: originalPrice + 100 }) });
assert.equal(viewerMutation.status, 403, 'viewer must not mutate products');
console.log(JSON.stringify({ status: 'passed', userId: account.user.id, orderNumber: result.order_number, products: catalog.items.length, shipment: shipment.shipment_number, returnNumber: createdReturn.returnNumber, adminProjection: rebuilt }));
