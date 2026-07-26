import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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

const raceStock = inventoryList.items.find(item =>
  item.product_id !== product.id
  && item.warehouse_code === 'WH-SEOUL'
  && Number(item.available_qty) > 0);
assert.ok(raceStock, 'a second sellable variant is required for reservation concurrency verification');
const raceBalances = inventoryList.items.filter(item =>
  item.variant_id === raceStock.variant_id
  && item.warehouse_code !== 'WH-RETURN');
for (const balance of raceBalances) {
  await request(`/inventory/variants/${raceStock.variant_id}`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({
      availableQty: balance.warehouse_id === raceStock.warehouse_id ? 1 : 0,
      warehouseId: balance.warehouse_id,
      reason: 'integration concurrent reservation verification',
    }),
  });
}
const [raceQuoteA, raceQuoteB] = await Promise.all([
  request('/checkout/quote', {
    method: 'POST',
    body: JSON.stringify({ items: [{ variantId: raceStock.variant_id, quantity: 1 }] }),
  }),
  request('/checkout/quote', {
    method: 'POST',
    body: JSON.stringify({ items: [{ variantId: raceStock.variant_id, quantity: 1 }] }),
  }),
]);
const raceShipping = {
  recipient: 'Concurrency Test',
  phone: '010-1111-2222',
  address: 'Seoul, Korea',
};
const [raceOrderA, raceOrderB] = await Promise.all([
  request('/orders', {
    method: 'POST',
    headers: { ...userHeaders, 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({
      userId: account.user.id,
      quoteToken: raceQuoteA.quoteToken,
      shipping: raceShipping,
      paymentMethod: 'card',
    }),
  }),
  request('/orders', {
    method: 'POST',
    headers: { ...userHeaders, 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({
      userId: account.user.id,
      quoteToken: raceQuoteB.quoteToken,
      shipping: raceShipping,
      paymentMethod: 'card',
    }),
  }),
]);
let raceOrders = [];
for (let attempt = 0; attempt < 40; attempt += 1) {
  await new Promise(resolve => setTimeout(resolve, 250));
  raceOrders = await Promise.all(
    [raceOrderA.id, raceOrderB.id].map(id => request(`/orders/${id}`, { headers: userHeaders })),
  );
  if (
    raceOrders.filter(value => ['confirmed', 'preparing'].includes(value.status)).length === 1
    && raceOrders.filter(value => value.status === 'cancelled').length === 1
  ) break;
}
const raceWinner = raceOrders.find(value => ['confirmed', 'preparing'].includes(value.status));
const raceLoser = raceOrders.find(value => value.status === 'cancelled');
assert.ok(raceWinner, 'exactly one concurrent order must reserve the last unit');
assert.ok(raceLoser, 'the competing order must be cancelled without overselling');
let loserPayment;
for (let attempt = 0; attempt < 20; attempt += 1) {
  await new Promise(resolve => setTimeout(resolve, 250));
  loserPayment = await request(`/payments/${raceLoser.id}`);
  if (loserPayment.status === 'refunded') break;
}
assert.equal(loserPayment.status, 'refunded', 'failed inventory reservation must refund approved payment');
const cancelledPaymentRetry = await fetch(`${base}/payments/confirm`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
  body: JSON.stringify({
    orderId: raceLoser.id,
    amount: Number(raceLoser.total_amount),
    paymentKey: `cancelled_retry_${raceLoser.id}`,
  }),
});
assert.equal(cancelledPaymentRetry.status, 409, 'cancelled orders must not be payable again');
const raceProductSoldOut = await request(`/products/${raceStock.product_id}`);
assert.equal(
  raceProductSoldOut.variants.find(variant => variant.id === raceStock.variant_id)?.availableQty,
  0,
  'the winning reservation must consume the only available unit',
);
execFileSync('docker', [
  'compose',
  'exec',
  '-T',
  'postgres',
  'psql',
  '-U',
  'canvas',
  '-d',
  'inventory',
  '-v',
  'ON_ERROR_STOP=1',
  '-c',
  `UPDATE inventory_reservations
   SET status='reserved',expires_at=now()-interval '1 second',updated_at=now()
   WHERE order_id='${raceWinner.id}' AND status='confirmed'`,
], { stdio: 'pipe' });
let expiredOrder;
for (let attempt = 0; attempt < 40; attempt += 1) {
  await new Promise(resolve => setTimeout(resolve, 250));
  expiredOrder = await request(`/orders/${raceWinner.id}`, { headers: userHeaders });
  if (expiredOrder.status === 'cancelled') break;
}
assert.equal(expiredOrder.status, 'cancelled', 'expired reservation must cancel the pending fulfillment');
let restoredVariant;
for (let attempt = 0; attempt < 20; attempt += 1) {
  await new Promise(resolve => setTimeout(resolve, 250));
  const restoredProduct = await request(`/products/${raceStock.product_id}`);
  restoredVariant = restoredProduct.variants.find(variant => variant.id === raceStock.variant_id);
  if (restoredVariant?.availableQty === 1) break;
}
assert.equal(restoredVariant?.availableQty, 1, 'order cancellation must release reserved stock exactly once');
let expiredPayment;
for (let attempt = 0; attempt < 20; attempt += 1) {
  await new Promise(resolve => setTimeout(resolve, 250));
  expiredPayment = await request(`/payments/${raceWinner.id}`);
  if (expiredPayment.status === 'refunded') break;
}
assert.equal(expiredPayment.status, 'refunded', 'expired reservation must refund approved payment');
let systemRefundAudit;
for (let attempt = 0; attempt < 20; attempt += 1) {
  await new Promise(resolve => setTimeout(resolve, 250));
  const refundAudits = await request(
    '/admin/audit-logs?page=1&pageSize=100&search=payment.refunded',
    { headers: adminHeaders },
  );
  systemRefundAudit = refundAudits.items.find(item =>
    item.action === 'payment.refunded' && item.entity_id === raceWinner.id);
  if (systemRefundAudit) break;
}
assert.ok(systemRefundAudit, 'automatic refund must create an admin audit log');
assert.equal(systemRefundAudit.actor_id, null, 'system actor must not be stored in the UUID actor column');
assert.equal(
  systemRefundAudit.metadata.actorId,
  'system',
  'system actor identity must be preserved in audit metadata',
);

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
const mismatchedPayment = await fetch(`${base}/payments/confirm`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
  body: JSON.stringify({
    orderId: order.id,
    amount: order.totalAmount - 1,
    paymentKey: `mismatch_${order.id}`,
  }),
});
assert.equal(mismatchedPayment.status, 409, 'payment must reject an amount that differs from the canonical order');
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
