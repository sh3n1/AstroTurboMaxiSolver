import { expect, test } from '@playwright/test';

import { moreTile, openPage, tapMore } from './navigation';

// Aligning the telescope: on a suggested star, on the target, and with a shutter remote.

test('aligns the telescope on a suggested star', async ({ page }) => {
  await page.goto('/');
  await expect(await moreTile(page, 'alignment-status')).toContainText('Not aligned');

  // The status on the sky map opens the alignment flow.
  await tapMore(page, 'alignment-status');
  const stars = page.locator('[data-testid=alignment-star]');
  await expect(stars.first()).toBeVisible();
  const starName = (await stars.first().locator('h2').innerText()).trim();

  await stars.first().click();
  await page.locator('[data-testid=confirm-centred]').click();

  // This browser has no camera, so plate solving fails and says why.
  await expect(page.locator('[data-testid=alignment-failed]')).toContainText('camera');
  await page.locator('[data-testid=align-simulated]').click();
  await expect(page.locator('[data-testid=alignment-result]')).toContainText('simulated');
  await page.locator('[data-testid=alignment-done]').click();

  // A toast on the sky map confirms it, and the result survives a reload.
  await expect(page.locator('[data-testid=alignment-toast] .toast-message')).toHaveText(`Aligned: ${starName}, rough`);
  await expect(await moreTile(page, 'alignment-status')).toContainText(starName);
  await page.reload();
  await expect(await moreTile(page, 'alignment-status')).toContainText(starName);
});

test('aligns on the selected target, and sums up the alignment on one line', async ({ page }) => {
  // A star the page suggests, so it is surely above the horizon now.
  await page.goto('/align');
  const name = (await page.locator('[data-testid=alignment-star] h2').first().textContent())!.trim();
  await expect(page.locator('[data-testid=align-selected-target]')).toHaveCount(0);

  // Selected on the map, it is offered first.
  await page.goto('/tabs/targets');
  await page.locator('app-targets ion-searchbar input').fill(name);
  await expect(page.locator('app-targets ion-item').first()).toContainText(name);
  await page.locator('app-targets ion-item').first().click();
  await tapMore(page, 'alignment-status');
  await expect(page.locator('[data-testid=align-selected-target]')).toContainText(name);
  await page.locator('[data-testid=align-selected-target]').click();
  await expect(page.locator('h2').filter({ hasText: `Centre ${name}` })).toBeVisible();

  await page.locator('[data-testid=confirm-centred]').click();
  await page.locator('[data-testid=align-simulated]').click();
  await page.locator('[data-testid=alignment-done]').click();
  await tapMore(page, 'alignment-status');
  await expect(page.locator('[data-testid=current-alignment]')).toContainText(`${name} ·`);
  await expect(page.locator('[data-testid=current-alignment]')).toContainText('simulated');

  // The bin removes it, after asking.
  await page.locator('[data-testid=remove-alignment]').click();
  await page.locator('ion-alert button', { hasText: 'Remove' }).click();
  await expect(page.locator('[data-testid=current-alignment]')).toHaveCount(0);
  await page.locator('app-align ion-back-button').click();
  await expect(await moreTile(page, 'alignment-status')).toContainText('Not aligned');
});

test('has no phone mount to choose, and drops an alignment made with the old mirror mount', async ({ page }) => {
  // The camera always looks straight at the sky. An alignment saved with a mirror, when the
  // app still offered one, measured a camera that sat differently, so it no longer counts.
  await page.addInitScript(() =>
    localStorage.setItem(
      'astroturbomaxisolver.alignment',
      JSON.stringify({
        value: { starId: 'Vega', alignedAt: '2026-11-10T22:00:00.000Z', mount: 'mirror', offset: [0, 0.7, 0.7] },
      }),
    ),
  );
  await page.goto('/');
  await openPage(page, 'Settings');
  await expect(page.locator('[data-testid=open-alignment]')).toContainText('Not aligned');
  await expect(page.locator('[data-testid=mount]')).toHaveCount(0);
});

test('aligns with a Bluetooth shutter remote, when switched on in Settings', async ({ page }) => {
  // A remote sends Volume Up, as a key press.
  const pressRemote = () =>
    page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'AudioVolumeUp' })));

  // Off at first: a press does nothing.
  await page.goto('/align');
  await page.locator('[data-testid=alignment-star]').first().click();
  await expect(page.locator('[data-testid=confirm-centred]')).toBeVisible();
  await pressRemote();
  await page.waitForTimeout(300);
  await expect(page.locator('[data-testid=confirm-centred]')).toBeVisible();

  // Switched on, a press aligns. This browser has no camera, so the solve fails, and a press retries.
  await page.goto('/tabs/settings');
  await page.locator('[data-testid=shutter-aligns]').click();
  await expect(page.locator('[data-testid=shutter-aligns]')).toHaveClass(/toggle-checked/);
  await page.goto('/align');
  await page.locator('[data-testid=alignment-star]').first().click();
  await pressRemote();
  await expect(page.locator('[data-testid=alignment-failed]')).toBeVisible();
  await pressRemote();
  await expect(page.locator('[data-testid=alignment-failed]')).toBeVisible();
});

test('offers a sync on the target once aligned, which needs a plate solve', async ({ page }) => {
  // A star the page suggests, so it is surely above the horizon now.
  await page.goto('/align');
  const name = (await page.locator('[data-testid=alignment-star] h2').first().textContent())!.trim();
  await page.goto('/tabs/targets');
  await page.locator('app-targets ion-searchbar input').fill(name);
  await expect(page.locator('app-targets ion-item').first()).toContainText(name);
  await page.locator('app-targets ion-item').first().click();
  // Not aligned yet: nothing to correct.
  await expect(page.getByTestId('target-bar')).toBeVisible();
  await expect(page.getByTestId('sync-target')).toHaveCount(0);

  await tapMore(page, 'alignment-status');
  await page.locator('[data-testid=align-selected-target]').click();
  await page.locator('[data-testid=confirm-centred]').click();
  await page.locator('[data-testid=align-simulated]').click();
  await page.locator('[data-testid=alignment-done]').click();

  // Aligned, the target's bar offers a sync. This browser has no camera, so the plate solve
  // fails, says so, and leaves the alignment as it was.
  await page.getByTestId('sync-target').click();
  await expect(page.getByTestId('sync-toast')).toContainText('Not synced');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('astroturbomaxisolver.alignment') ?? '{}'));
  expect(saved.value.syncs).toBeUndefined();
  expect(saved.value.position.altDeg).toBeGreaterThan(0);
});
