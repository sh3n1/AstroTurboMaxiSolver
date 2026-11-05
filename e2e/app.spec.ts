import { expect, test } from '@playwright/test';

test('visits the app root url', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('app-sky ion-segment')).toBeVisible();
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

test('aligns the telescope on a suggested star', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-testid=alignment-status]')).toContainText('Not aligned');

  // The status on the sky map opens the alignment flow.
  await page.locator('[data-testid=alignment-status]').click();
  const stars = page.locator('[data-testid=alignment-star]');
  await expect(stars.first()).toBeVisible();
  const starName = (await stars.first().locator('h2').innerText()).trim();

  await stars.first().click();
  await page.locator('[data-testid=confirm-centred]').click();
  await page.locator('[data-testid=alignment-done]').click();

  // The result shows on the sky map, and survives a reload.
  await expect(page.locator('[data-testid=alignment-status]')).toContainText(starName);
  await page.reload();
  await expect(page.locator('[data-testid=alignment-status]')).toContainText(starName);
});

test('asks for alignment again after the mount changes', async ({ page }) => {
  await page.goto('/align');
  await page.locator('[data-testid=alignment-star]').first().click();
  await page.locator('[data-testid=confirm-centred]').click();
  await page.locator('[data-testid=alignment-done]').click();

  await page.getByRole('tab', { name: 'Settings' }).click();
  await expect(page.locator('[data-testid=open-alignment]')).toContainText('Aligned on');
  await page.evaluate(() => {
    // Selecting through the native picker is slow to drive, so set the value directly.
    document
      .querySelectorAll('app-settings ion-select')[1]
      .dispatchEvent(new CustomEvent('ionChange', { detail: { value: 'mirror' }, bubbles: true }));
  });
  await expect(page.locator('[data-testid=open-alignment]')).toContainText('Not aligned');
});

test('filters targets by type', async ({ page }) => {
  await page.goto('/tabs/targets');
  await page.locator('app-targets ion-chip', { hasText: 'Galaxy' }).click();
  await expect(page.locator('app-targets ion-item')).toHaveCount(5);
  await expect(page.locator('app-targets ion-item', { hasText: 'Vega' })).toHaveCount(0);
});

test('shows tonight in the session plan', async ({ page }) => {
  await page.goto('/tabs/plan');
  await expect(page.locator('[data-testid=conditions]')).toContainText('Darkness');
  await expect(page.locator('[data-testid=conditions]')).toContainText('% lit');
});
