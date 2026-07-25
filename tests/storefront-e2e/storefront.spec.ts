import { expect, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from '../accessibility';

test('고객이 홈에서 상품을 탐색할 수 있다', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/TECHZONE/i);
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('a[href^="/products/"]').first()).toBeVisible();

  await page.goto('/shop/');
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('a[href^="/products/"]').first()).toBeVisible();
});

test('@a11y 고객 홈과 상품 목록이 WCAG 2.1 AA를 충족한다', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await expect(page.locator('a[href^="/products/"]').first()).toBeVisible();
  await expectNoAccessibilityViolations(page, '고객 홈');

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: '본문 바로가기' })).toBeFocused();

  await page.goto('/shop/');
  await expect(page.locator('a[href^="/products/"]').first()).toBeVisible();
  await expectNoAccessibilityViolations(page, '상품 목록');
});

test('상품 상세가 검색 엔진용 메타데이터와 Product 구조화 데이터를 제공한다', async ({ page }) => {
  await page.goto('/products/techzone-oled-monitor-32/');

  await expect(page).toHaveTitle('TECHZONE OLED 게이밍 모니터 32 | TECHZONE');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /TECHZONE 공식 제품/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/products\/techzone-oled-monitor-32\/$/);

  const structuredData = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').textContent()) || '{}',
  );
  expect(structuredData).toMatchObject({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'TECHZONE OLED 게이밍 모니터 32',
    sku: 'TZ-MN-OLED32',
    offers: {
      '@type': 'Offer',
      priceCurrency: 'KRW',
      availability: 'https://schema.org/InStock',
    },
  });
});
