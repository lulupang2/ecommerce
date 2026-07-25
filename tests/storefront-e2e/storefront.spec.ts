import { expect, test } from '@playwright/test';

test('고객이 홈에서 상품을 탐색할 수 있다', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/TECHZONE/i);
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('a[href^="/products/"]').first()).toBeVisible();

  await page.goto('/shop/');
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('a[href^="/products/"]').first()).toBeVisible();
});
