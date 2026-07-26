import { expect, test, type Page } from '@playwright/test';
import { expectNoAccessibilityViolations } from '../accessibility';

async function gotoStorefront(page: Page, path: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 8_000 });
    } catch (error) {
      lastError = error;
      if (attempt < 2) await page.waitForTimeout(300);
    }
  }
  throw lastError;
}

test('고객이 홈에서 상품을 탐색할 수 있다', async ({ page }) => {
  await gotoStorefront(page, '/');

  await expect(page).toHaveTitle(/TECHZONE/i);
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('a[href^="/products/"]').first()).toBeVisible();

  await gotoStorefront(page, '/shop/');
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('a[href^="/products/"]').first()).toBeVisible();
  const mobileFilterButton = page.getByRole('button', { name: '필터', exact: true });
  if (await mobileFilterButton.isVisible()) await mobileFilterButton.click();
  await page.getByRole('checkbox', { name: '할인 상품만' }).check();
  await expect(page).toHaveURL(/discounted=true/);
  await expect(page.locator('a[href^="/products/"]').first()).toBeVisible();
});

test('장바구니와 체크아웃 서버 상태가 화면 간에 동기화된다', async ({ page }) => {
  await gotoStorefront(page, '/shop/');

  const productCard = page.locator('article').nth(1);
  const productName = (await productCard.locator('a[href^="/products/"]').last().textContent())?.trim();
  expect(productName).toBeTruthy();

  const addResponse = page.waitForResponse(response => (
    response.url().includes('/api/carts/')
    && response.url().endsWith('/items')
    && response.request().method() === 'POST'
  ));
  await productCard.getByRole('button', { name: '장바구니 담기' }).click({ force: true });
  expect((await addResponse).status()).toBe(201);

  const cartPanel = page.getByRole('dialog', { name: '장바구니' });
  await expect(cartPanel).toBeVisible();
  await expect(cartPanel).toContainText(productName!);

  await gotoStorefront(page, '/cart/');
  const cartItem = page.locator('main article').filter({ hasText: productName! });
  await expect(cartItem).toBeVisible();
  const quantityResponse = page.waitForResponse(response => (
    response.url().includes('/api/carts/')
    && response.request().method() === 'PATCH'
  ));
  await cartItem.getByRole('button', { name: `${productName} 수량 늘리기` }).click();
  expect([200, 204]).toContain((await quantityResponse).status());
  await expect(cartItem).toContainText('2');

  const quoteResponse = page.waitForResponse(response => (
    response.url().includes('/api/checkout/quote')
    && response.request().method() === 'POST'
  ));
  await gotoStorefront(page, '/checkout/');
  expect((await quoteResponse).status()).toBe(200);
  await expect(page.getByRole('heading', { name: '최종 결제 금액' })).toBeVisible();
  await expect(page.getByRole('button', { name: /결제하기/ })).toBeEnabled();
});

test('@a11y 고객 홈과 상품 목록이 WCAG 2.1 AA를 충족한다', async ({ page }) => {
  test.setTimeout(60_000);
  await gotoStorefront(page, '/');
  await expect(page.locator('a[href^="/products/"]').first()).toBeVisible();
  await expectNoAccessibilityViolations(page, '고객 홈');

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: '본문 바로가기' })).toBeFocused();

  await gotoStorefront(page, '/shop/');
  await expect(page.locator('a[href^="/products/"]').first()).toBeVisible();
  await expectNoAccessibilityViolations(page, '상품 목록');
});

test('상품 상세가 검색 엔진용 메타데이터와 Product 구조화 데이터를 제공한다', async ({ page }) => {
  const slug = 'nova-book-air-14';
  await gotoStorefront(page, `/products/${slug}/`);

  const productName = (await page.getByRole('heading', { level: 1 }).textContent())?.trim();
  expect(productName).toBeTruthy();
  await expect(page).toHaveTitle(`${productName} | TECHZONE`);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /\S+/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    new RegExp(`/products/${slug}/$`),
  );

  const structuredData = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').textContent()) || '{}',
  );
  expect(structuredData).toMatchObject({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: productName,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'KRW',
    },
  });
  expect(structuredData.sku).toBeTruthy();
  expect(structuredData.offers.availability).toMatch(
    /^https:\/\/schema\.org\/(InStock|OutOfStock)$/,
  );
});

test('상품 상세에서 본 상품을 홈의 최근 본 상품에서 다시 찾을 수 있다', async ({ page }) => {
  const slug = 'nova-book-air-14';
  await gotoStorefront(page, '/');
  await page.evaluate(() => {
    localStorage.setItem('techzone-recent', 'invalid-json');
  });
  await gotoStorefront(page, `/products/${slug}/`);
  const productName = (await page.getByRole('heading', { level: 1 }).textContent())?.trim();
  expect(productName).toBeTruthy();

  await gotoStorefront(page, '/');

  const recentSection = page.getByRole('region', { name: '최근 본 상품' });
  await expect(recentSection).toBeVisible();
  await expect(recentSection.getByRole('link', { name: productName, exact: true }).first()).toHaveAttribute(
    'href',
    `/products/${slug}/`,
  );
  await expect(recentSection.getByRole('button', { name: '장바구니 담기' })).toHaveCount(0);
});

test('로그인 회원의 찜 상품이 서버에 저장되어 마이페이지에 표시된다', async ({ page }) => {
  const email = `wishlist-${Date.now()}-${test.info().project.name}@techzone.local`;
  const password = 'Wishlist1234!';
  const slug = 'nova-book-air-14';

  await gotoStorefront(page, '/login/');
  const registerButton = page.getByRole('button', { name: '회원가입' });
  const nameField = page.getByLabel('이름');
  await expect.poll(async () => {
    await registerButton.click();
    return nameField.isVisible();
  }, { message: '회원가입 폼이 hydration 후 표시되어야 합니다.' }).toBe(true);
  await nameField.fill('찜 테스트 고객');
  await page.getByLabel('이메일').fill(email);
  await page.getByLabel('비밀번호').fill(password);
  await page.getByRole('button', { name: /계정 만들기/ }).click({ force: true });
  await expect(page.getByRole('status')).toContainText('로그인되었습니다.');

  await gotoStorefront(page, `/products/${slug}/`);
  const productName = (await page.getByRole('heading', { level: 1 }).textContent())?.trim();
  expect(productName).toBeTruthy();
  const wishlistResponse = page.waitForResponse(response => (
    response.url().includes('/api/wishlists/')
    && response.request().method() === 'POST'
  ));
  await page.getByRole('button', { name: '찜하기' }).click();
  expect((await wishlistResponse).status()).toBe(201);

  await page.evaluate(() => localStorage.removeItem('techzone-wishlist'));
  await page.reload();
  await expect(page.getByRole('button', { name: '찜 해제' })).toBeVisible();

  await gotoStorefront(page, '/mypage/');
  const wishlistSection = page.locator('#wishlist-products');
  await expect(wishlistSection.getByRole('link', { name: productName, exact: true }).first()).toHaveAttribute(
    'href',
    `/products/${slug}/`,
  );

  await gotoStorefront(page, '/login/');
  await page.getByRole('button', { name: /로그아웃/ }).click({ force: true });
  await expect(page.getByRole('status')).toContainText('로그아웃되었습니다.');
  await gotoStorefront(page, `/products/${slug}/`);
  await expect(page.getByRole('button', { name: '찜하기' })).toBeVisible();
});
