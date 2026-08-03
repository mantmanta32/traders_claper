import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
});

test('desktop dashboard renders and consumes the live Binance websocket feeds', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  await expect(page.getByText('ERKEN UYARI')).toBeVisible();
  await expect(page.locator('.feed-pill').filter({ hasText: 'Market' }).locator('.state-live')).toBeVisible();
  await expect(page.locator('.feed-pill').filter({ hasText: 'Public' }).locator('.state-live')).toBeVisible();
  await expect(page.locator('.chip-green')).not.toContainText('0 sembol');

  await page.getByRole('tab', { name: /Tarayıcı/ }).click();
  await expect(page.locator('.symbol-card').first()).toBeVisible();
  expect(await page.locator('.symbol-card').count()).toBeGreaterThan(20);
  await page.getByPlaceholder(/Coin ara/).fill('BTCUSDT');
  await expect(page.locator('.symbol-card')).toHaveCount(1);
  await expect(page.locator('.symbol-card')).toContainText('BTC');

  await page.getByRole('button', { name: 'Ayarlar' }).click();
  await expect(page.getByRole('dialog', { name: 'Ayarlar' })).toBeVisible();
  await page.getByRole('button', { name: 'Tema', exact: true }).click();
  await page.getByRole('button', { name: /Dark/ }).click();
  await page.getByRole('button', { name: /Kaydet/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.screenshot({ path: 'artifacts/ews-v3-desktop.png', fullPage: true });
  expect(pageErrors).toEqual([]);
});

test('mobile navigation remains usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.mobile-nav')).toBeVisible();
  await page.locator('.mobile-nav button').filter({ hasText: 'Tarayıcı' }).click();
  await expect(page.getByPlaceholder(/Coin ara/)).toBeVisible();
  await page.locator('.mobile-nav button').filter({ hasText: 'Analitik' }).click();
  await expect(page.getByText('Toplam Sinyal')).toBeVisible();
});
