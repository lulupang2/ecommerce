import assert from 'node:assert/strict';

const base = process.env.API_BASE || 'http://127.0.0.1:18080/api';
async function raw(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const text = await response.text();
  return { response, data: text ? JSON.parse(text) : null };
}
async function ok(path, options = {}) {
  const result = await raw(path, options);
  assert.ok(result.response.ok, `${options.method || 'GET'} ${path}: ${result.response.status} ${JSON.stringify(result.data)}`);
  return result;
}

const stamp = Date.now();
const password = 'Security1234!';
const first = (await ok('/auth/register', {
  method: 'POST',
  headers: { 'x-client-platform': 'capacitor' },
  body: JSON.stringify({ email: `security-a-${stamp}@techzone.local`, password, name: '보안 테스트 A' }),
})).data;
const second = (await ok('/auth/register', {
  method: 'POST',
  headers: { 'x-client-platform': 'capacitor' },
  body: JSON.stringify({ email: `security-b-${stamp}@techzone.local`, password, name: '보안 테스트 B' }),
})).data;

const crossCart = await raw(`/carts/${second.user.id}`, { headers: { authorization: `Bearer ${first.accessToken}` } });
assert.equal(crossCart.response.status, 403, '다른 회원의 장바구니 접근을 차단해야 합니다.');
const crossOrders = await raw(`/orders?userId=${second.user.id}`, { headers: { authorization: `Bearer ${first.accessToken}` } });
assert.equal(crossOrders.response.status, 403, '다른 회원의 주문 목록 접근을 차단해야 합니다.');
const anonymousWishlist = await raw(`/wishlists/${first.user.id}`);
assert.equal(anonymousWishlist.response.status, 401, '찜 목록은 로그인한 회원만 조회할 수 있어야 합니다.');
const crossWishlist = await raw(`/wishlists/${second.user.id}`, { headers: { authorization: `Bearer ${first.accessToken}` } });
assert.equal(crossWishlist.response.status, 403, '다른 회원의 찜 목록 접근을 차단해야 합니다.');
const ownWishlist = await ok(`/wishlists/${first.user.id}`, { headers: { authorization: `Bearer ${first.accessToken}` } });
assert.ok(Array.isArray(ownWishlist.data.items), '본인의 찜 목록은 정상 조회할 수 있어야 합니다.');
assert.match(ownWishlist.response.headers.get('cache-control') || '', /no-store/, '회원별 찜 목록은 캐시하지 않아야 합니다.');
const crossWishlistMutation = await raw(`/wishlists/${second.user.id}/${crypto.randomUUID()}`, {
  method: 'POST',
  headers: { authorization: `Bearer ${first.accessToken}` },
  body: '{}',
});
assert.equal(crossWishlistMutation.response.status, 403, '다른 회원의 찜 목록을 변경할 수 없어야 합니다.');

const rotated = (await ok('/auth/refresh', {
  method: 'POST',
  headers: { 'x-client-platform': 'capacitor' },
  body: JSON.stringify({ refreshToken: first.refreshToken }),
})).data;
assert.notEqual(rotated.refreshToken, first.refreshToken, 'refresh token은 회전되어야 합니다.');
const reuse = await raw('/auth/refresh', {
  method: 'POST',
  headers: { 'x-client-platform': 'capacitor' },
  body: JSON.stringify({ refreshToken: first.refreshToken }),
});
assert.equal(reuse.response.status, 401);
assert.equal(reuse.data.code, 'REFRESH_TOKEN_REUSED');
const revokedFamily = await raw('/auth/refresh', {
  method: 'POST',
  headers: { 'x-client-platform': 'capacitor' },
  body: JSON.stringify({ refreshToken: rotated.refreshToken }),
});
assert.equal(revokedFamily.response.status, 401, '탈취 재사용 감지 후 token family 전체를 폐기해야 합니다.');

const webLogin = await ok('/auth/login', {
  method: 'POST',
  headers: { 'x-client-platform': 'web' },
  body: JSON.stringify({ email: `security-b-${stamp}@techzone.local`, password }),
});
const cookies = webLogin.response.headers.getSetCookie?.() || [webLogin.response.headers.get('set-cookie')];
const cookieHeader = cookies.filter(Boolean).map(value => value.split(';')[0]).join('; ');
assert.match(cookieHeader, /tz_access=/);
assert.match(cookieHeader, /tz_csrf=/);
const csrf = decodeURIComponent(cookieHeader.match(/tz_csrf=([^;]+)/)?.[1] || '');
const missingCsrf = await raw(`/carts/${second.user.id}/items`, {
  method: 'POST',
  headers: { cookie: cookieHeader },
  body: JSON.stringify({ productId: crypto.randomUUID(), name: 'CSRF 테스트', brand: 'TECHZONE', price: 1000, quantity: 1 }),
});
assert.equal(missingCsrf.response.status, 403);
assert.equal(missingCsrf.data.code, 'CSRF_INVALID');
const acceptedCsrf = await raw(`/carts/${second.user.id}/items`, {
  method: 'POST',
  headers: { cookie: cookieHeader, 'x-csrf-token': csrf },
  body: JSON.stringify({ productId: crypto.randomUUID(), name: 'CSRF 테스트', brand: 'TECHZONE', price: 1000, quantity: 1 }),
});
assert.equal(acceptedCsrf.response.status, 201, '정상 CSRF 토큰은 허용해야 합니다.');

const jwks = (await ok('/.well-known/jwks.json')).data;
assert.ok(jwks.keys.some(key => key.alg === 'RS256' && key.use === 'sig'), 'JWKS는 RS256 공개키를 제공해야 합니다.');
console.log(JSON.stringify({
  status: 'passed',
  ownership: true,
  wishlistOwnership: true,
  refreshReuseDetection: true,
  csrf: true,
  jwks: true,
}));
