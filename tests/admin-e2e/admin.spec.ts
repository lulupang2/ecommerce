import { expect, test } from '@playwright/test';

test('관리자가 로그인하여 대시보드와 상품 목록을 운영할 수 있다', async ({ page }) => {
  await page.goto('/admin/login/');
  await page.getByLabel('이메일').fill(process.env.ADMIN_EMAIL || 'admin@techzone.local');
  await page.getByLabel('비밀번호').fill(process.env.ADMIN_PASSWORD || 'TechzoneAdmin123!');
  await page.getByRole('button', { name: '로그인' }).click();

  await expect(page).toHaveURL(/\/admin\/?$/);
  await expect(page.getByText('총매출', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('주문 상태', { exact: true }).first()).toBeVisible();

  await page.getByRole('link', { name: '상품 관리' }).click();
  await expect(page).toHaveURL(/\/admin\/products\/manage\/?/);
  await expect(page.getByRole('heading', { name: /상품 관리/ })).toBeVisible();
  await expect(page.getByRole('link', { name: '상품 등록' })).toBeVisible();
  await expect(page.locator('table')).toBeVisible();
});
