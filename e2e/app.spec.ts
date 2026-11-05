import { expect, test } from '@playwright/test';

test('visits the app root url', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('app-sky ion-segment')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Targets' })).toBeVisible();
});

test('opens on a close zoom with the sky data loaded', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('app-sky canvas');
  await expect(canvas).toHaveAttribute('data-field', '20');
  await expect(page.locator('app-sky canvas:not([data-constellation-count="0"])')).toBeAttached();
  await expect(page.locator('[data-testid=pointing]')).toContainText('RA');

  // Zoom changes what the canvas shows.
  await page.locator('[data-testid=zoom-out]').click();
  await expect(canvas).toHaveAttribute('data-field', '30');
});

test('shows target details from the target bar', async ({ page }) => {
  await page.goto('/tabs/targets');
  await page.locator('app-targets ion-searchbar input').fill('M31');
  // Wait for the search to apply, because the list updates just after typing.
  await expect(page.locator('app-targets ion-item').first()).toContainText('M31');
  await page.locator('app-targets ion-item').first().click();
  await expect(page.locator('[data-testid=target-bar]')).toContainText('M31');
  await page.locator('[data-testid=target-info]').click();
  await expect(page.locator('[data-testid=target-details]')).toContainText('across');
  await expect(page.locator('[data-testid=target-details]')).toContainText('NGC 224');
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
  await page.locator('[data-testid=night-mode]').click();
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
  await expect(page.locator('app-targets ion-item')).toHaveCount(40);
  await expect(page.locator('[data-testid=more-results]')).toContainText('Showing 40 of');
  await expect(page.locator('app-targets ion-item', { hasText: 'Vega' })).toHaveCount(0);
});

test('shows tonight in the session plan', async ({ page }) => {
  await page.goto('/tabs/plan');
  await expect(page.locator('[data-testid=conditions]')).toContainText('Darkness');
  await expect(page.locator('[data-testid=conditions]')).toContainText('% lit');
});

test('finds catalogue objects by name and other designation', async ({ page }) => {
  await page.goto('/tabs/targets');
  const search = page.locator('app-targets ion-searchbar input');
  const rows = page.locator('app-targets ion-item');

  // All 110 Messier objects load, and search looks at other designations too.
  await search.fill('Crab');
  await expect(rows.first()).toContainText('M1');
  await search.fill('NGC 224');
  await expect(rows.first()).toContainText('M31');
  // M31 is only listed once, under its Messier name.
  await expect(page.locator('app-targets ion-item h2', { hasText: /^NGC 224$/ })).toHaveCount(0);

  // NGC and IC objects from OpenNGC.
  await search.fill('NGC 7000');
  await expect(rows.first()).toContainText('NGC 7000');
  await search.fill('IC 434');
  await expect(rows.first()).toContainText('IC 434');
});

test('lists the planets and the Moon', async ({ page }) => {
  await page.goto('/tabs/targets');
  await page.locator('app-targets ion-chip', { hasText: 'Solar system' }).click();
  const rows = page.locator('app-targets ion-item');
  await expect(rows).toHaveCount(8);
  await expect(page.locator('app-targets ion-item', { hasText: 'Jupiter' })).toHaveCount(1);
  await expect(page.locator('app-targets ion-item', { hasText: 'Moon' })).toHaveCount(1);
});

test('fades the reticle in and out only while plate solving', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('app-sky canvas');
  await expect(canvas).toHaveAttribute('data-reticle-opacity', '1.00');

  // Angular's development tools reach the app's state, since nothing on this page starts a solve yet.
  const setSolving = (value: boolean): Promise<void> =>
    page.evaluate((solving) => {
      const { ng } = window as unknown as {
        ng: { getComponent: (el: Element) => { state: { plateSolving: { set: (v: boolean) => void } } } };
      };
      ng.getComponent(document.querySelector('app-sky')!).state.plateSolving.set(solving);
    }, value);

  await setSolving(true);
  const seen = new Set<string>();
  await expect
    .poll(async () => {
      seen.add((await canvas.getAttribute('data-reticle-opacity')) ?? '');
      return seen.size;
    })
    .toBeGreaterThan(2);
  const values = [...seen].map(Number);
  expect(Math.min(...values)).toBeLessThan(1);
  expect(Math.min(...values)).toBeGreaterThanOrEqual(0.25);

  await setSolving(false);
  await expect(canvas).toHaveAttribute('data-reticle-opacity', '1.00');
});
