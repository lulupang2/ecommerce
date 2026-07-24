import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const base = process.env.API_BASE || 'http://127.0.0.1:18080/api';
async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  assert.ok(response.ok, `${options.method || 'GET'} ${path}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}

const home = await request('/storefront/home');
assert.ok(home.sections.length >= 6, 'CMS 홈에는 주요 진열 섹션이 있어야 합니다.');
assert.ok(home.sections.every(section => section.status === 'published'), '공개 홈에는 게시 중인 섹션만 노출되어야 합니다.');

const filtered = await request('/products?category=laptop&inStock=true&sort=price_asc&page=1&pageSize=4');
assert.ok(filtered.items.length > 0, '카테고리·재고 필터 결과가 있어야 합니다.');
assert.ok(filtered.items.every(product => product.category === '노트북' && product.stock > 0));
const searched = await request('/products?q=NOVA&minPrice=100000&maxPrice=3000000');
assert.ok(searched.items.some(product => product.brand === 'NOVA'), '통합 검색과 가격 필터를 함께 지원해야 합니다.');

const product = filtered.items[0];
const detail = await request(`/products/by-slug/${product.slug}`);
assert.ok(detail.variants.length >= 2, '상품 상세에는 복수 variant가 있어야 합니다.');
assert.ok(detail.images.length >= 2 && detail.specs.length >= 3, '상품 이미지와 스펙이 제공되어야 합니다.');

const quote = await request('/checkout/quote', {
  method: 'POST',
  body: JSON.stringify({ items: [{ variantId: detail.variants[0].id, quantity: 1 }], couponCode: 'TECHZONE10' }),
});
assert.equal(quote.discountAmount, Math.min(Math.floor(quote.subtotalAmount * 0.1), 50000));
assert.equal(quote.shippingFee, quote.subtotalAmount >= 80000 ? 0 : 3000);
assert.equal(quote.totalAmount, quote.subtotalAmount - quote.discountAmount + quote.shippingFee);
assert.ok(quote.quoteToken && quote.expiresIn === 600);

const guestId = crypto.randomUUID();
const phone = '010-9876-5432';
const order = await request('/orders', {
  method: 'POST',
  body: JSON.stringify({
    userId: guestId,
    quoteToken: quote.quoteToken,
    guestOrder: true,
    paymentMethod: 'kakaopay',
    shipping: {
      recipient: '비회원 테스트',
      phone,
      postalCode: '06134',
      address: '서울특별시 강남구 테헤란로 123',
    },
  }),
});
assert.ok(order.guestOrderToken, '비회원 주문 생성 시 주문 전용 토큰을 반환해야 합니다.');

const wrongPhone = await fetch(`${base}/orders/guest/access`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ orderNumber: order.orderNumber, phone: '010-0000-0000' }),
});
assert.equal(wrongPhone.status, 401, '다른 휴대폰 번호로 비회원 주문에 접근할 수 없어야 합니다.');

const access = await request('/orders/guest/access', {
  method: 'POST',
  body: JSON.stringify({ orderNumber: order.orderNumber, phone: '01098765432' }),
});
const guestDetail = await request(`/orders/guest/${order.id}`, {
  headers: { authorization: `Bearer ${access.accessToken}` },
});
assert.equal(guestDetail.id, order.id);
assert.equal(guestDetail.coupon_code, 'TECHZONE10');
assert.equal(guestDetail.payment_method, 'kakaopay');

const isolated = await fetch(`${base}/orders/guest/${crypto.randomUUID()}`, {
  headers: { authorization: `Bearer ${access.accessToken}` },
});
assert.equal(isolated.status, 401, '비회원 JWT는 발급된 주문 한 건에만 사용할 수 있어야 합니다.');

console.log(JSON.stringify({
  status: 'passed',
  sections: home.sections.length,
  products: filtered.total,
  slug: detail.slug,
  orderNumber: order.orderNumber,
  totalAmount: order.totalAmount,
}));
