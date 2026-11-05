import { expect, test } from '@playwright/test';

test('visits the app root url', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('app-sky ion-title')).toContainText('AstroFinder');
  await expect(page.getByRole('tab', { name: 'Targets' })).toBeVisible();
});

test('finds a target, guides to it and shows it in the eyepiece', async ({ page }) => {
  await page.goto('/');

  // Search for a target and select it, which opens the sky map.
  await page.getByRole('tab', { name: 'Targets' }).click();
  await page.locator('app-targets ion-searchbar input').fill('Vega');
  await expect(page.locator('app-targets ion-item')).toHaveCount(1);
  await page.locator('app-targets ion-item').click();
  await expect(page.locator('[data-testid=guidance]')).toContainText('away');

  // Aiming at it brings the remaining distance to zero.
  await page.locator('[data-testid=aim-at-target]').click();
  await expect(page.locator('[data-testid=guidance]')).toContainText('0.0° away');

  // Vega itself is in the eyepiece, so the empty field message must not appear.
  await page.locator('app-sky ion-segment-button[value=eyepiece]').click();
  await expect(page.locator('app-sky canvas:not([data-star-count="0"])')).toBeAttached();
  await expect(page.locator('.empty-field')).toHaveCount(0);
});

test('remembers night mode after a reload', async ({ page }) => {
  await page.goto('/tabs/settings');
  await page.locator('app-settings ion-toggle').click();
  await expect(page.locator('html')).toHaveClass(/night/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/night/);
});
