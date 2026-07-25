import { expect, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from '../accessibility';

test('관리자가 로그인하여 대시보드와 상품 목록을 운영할 수 있다', async ({ page }) => {
  await page.goto('/admin/login/');
  await page.getByLabel('이메일').fill(process.env.ADMIN_EMAIL || 'admin@techzone.local');
  await page.getByLabel('비밀번호').fill(process.env.ADMIN_PASSWORD || 'TechzoneAdmin123!');
  await page.getByRole('button', { name: '로그인' }).click();

  await expect(page).toHaveURL(/\/admin\/?$/);
  await expect(page.getByText('총매출', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('주문 상태', { exact: true }).first()).toBeVisible();

  const firstOrderNumber = (await page.locator('table tbody tr').first().locator('td').first().innerText()).trim();
  const recentOrderLink = page.locator(`a[href="/admin/orders/?q=${encodeURIComponent(firstOrderNumber)}"]`);
  await expect(recentOrderLink).toBeVisible();
  await recentOrderLink.click();
  await expect(page).toHaveURL(new RegExp(`/admin/orders/\\?.*q=${encodeURIComponent(firstOrderNumber)}`));
  await expect(page.getByRole('heading', { name: /주문 관리/ })).toBeVisible();
  await page.goto('/admin/');

  await page.getByRole('link', { name: /반품 처리 대기/ }).click();
  await expect(page).toHaveURL(/\/admin\/returns\/\?.*status=requested/);
  await expect(page.getByRole('heading', { name: /반품·환불/ })).toBeVisible();

  await page.getByRole('link', { name: '상품 관리' }).click();
  await expect(page).toHaveURL(/\/admin\/products\/manage\/?/);
  await expect(page.getByRole('heading', { name: /상품 관리/ })).toBeVisible();
  await expect(page.getByRole('link', { name: '상품 등록' })).toBeVisible();
  await expect(page.locator('table')).toBeVisible();
});

test('관리자 access token 만료 시 refresh token으로 세션을 복구한다', async ({ page, context }) => {
  await page.goto('/admin/login/');
  await page.getByLabel('이메일').fill(process.env.ADMIN_EMAIL || 'admin@techzone.local');
  await page.getByLabel('비밀번호').fill(process.env.ADMIN_PASSWORD || 'TechzoneAdmin123!');
  await page.getByRole('button', { name: '로그인' }).click();
  await expect(page).toHaveURL(/\/admin\/?$/);

  const cookies = await context.cookies();
  expect(cookies.some(cookie => cookie.name === 'tz_refresh')).toBe(true);
  await context.clearCookies({ name: 'tz_access' });
  await page.reload();

  await expect(page.getByText('총매출', { exact: true }).first()).toBeVisible();
  const refreshedCookies = await context.cookies();
  expect(refreshedCookies.some(cookie => cookie.name === 'tz_access')).toBe(true);
});

test('@a11y 관리자 로그인과 대시보드가 WCAG 2.1 AA를 충족한다', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/admin/login/');
  await expectNoAccessibilityViolations(page, '관리자 로그인');

  await page.getByLabel('이메일').fill(process.env.ADMIN_EMAIL || 'admin@techzone.local');
  await page.getByLabel('비밀번호').fill(process.env.ADMIN_PASSWORD || 'TechzoneAdmin123!');
  await page.getByRole('button', { name: '로그인' }).click();
  await expect(page).toHaveURL(/\/admin\/?$/);
  await expect(page.getByText('총매출', { exact: true }).first()).toBeVisible();
  await expectNoAccessibilityViolations(page, '관리자 대시보드');

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: '본문 바로가기' })).toBeFocused();
});
