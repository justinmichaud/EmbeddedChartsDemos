import { test, expect } from '@playwright/test';

test('main page creates iframe', async ({ page }) => {
  await page.goto('/');
  const iframe = page.locator('iframe#frame');
  await expect(iframe).toBeVisible({ timeout: 5000 });
});

test('iframe loads and shows charts', async ({ page }) => {
  await page.goto('/');
  const frame = page.frameLocator('iframe#frame');
  // Wait for at least one chart to appear
  await expect(frame.locator('[data-symbol]').first()).toBeVisible({ timeout: 8000 });
});

test('settings button opens settings modal', async ({ page }) => {
  await page.goto('/');
  const frame = page.frameLocator('iframe#frame');
  await frame.locator('button', { hasText: 'SETTINGS' }).waitFor({ timeout: 8000 });
  await frame.locator('button', { hasText: 'SETTINGS' }).click();
  await expect(frame.locator('text=CURRENCY')).toBeVisible({ timeout: 3000 });
});

test('changing chart count in settings updates displayed charts', async ({ page }) => {
  await page.goto('/');
  const frame = page.frameLocator('iframe#frame');

  // Wait for default 14 charts to appear
  await expect(frame.locator('[data-symbol]')).toHaveCount(14, { timeout: 8000 });

  // Open settings and select 4 charts
  await frame.locator('button', { hasText: 'SETTINGS' }).click();
  await frame.getByRole('button', { name: '4', exact: true }).click();

  // Wait for next DATA tick (worker fires every 200ms) to apply the new count
  await expect(frame.locator('[data-symbol]')).toHaveCount(4, { timeout: 2000 });
});

test('test reload button reloads iframe', async ({ page }) => {
  await page.goto('/');
  const frame = page.frameLocator('iframe#frame');
  await frame.locator('button', { hasText: 'RECOVER' }).waitFor({ timeout: 8000 });

  // Watch for iframe navigation
  const navPromise = page.waitForEvent('framenavigated');
  await frame.locator('button', { hasText: 'RECOVER' }).click();
  await navPromise;

  // Iframe should reload and show charts again
  await expect(frame.locator('[data-symbol]').first()).toBeVisible({ timeout: 8000 });
});
