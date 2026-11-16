import { expect, test } from '@playwright/test';

import { openPage, tapMore } from './navigation';

/** Lets the app know where the test phone is, in Madrid, so the sky has a place. */
test.beforeEach(async ({ page, context }) => {
  // The time control shows the forecast, but tests never call the real service.
  await page.route('https://api.open-meteo.com/**', (route) => route.abort('internetdisconnected'));
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 40.4168, longitude: -3.7038 });
  await page.goto('/');
  await page.locator('[data-testid=location]').click();
  await expect(page.locator('[data-testid=location]')).toHaveText('40.42° N, 3.70° W');
});

test('plans for another time from the sky map, and goes back to now', async ({ page }) => {
  await tapMore(page, 'open-time');
  const ruler = page.locator('[data-testid=time-ruler]');
  await expect(ruler).toBeVisible();
  // Not planning yet, so Now has nothing to do.
  await expect(page.locator('[data-testid=time-now]')).toHaveAttribute('disabled', '');

  // Two hours later: dragging the ruler to the left brings later hours to the marker.
  const before = await page.locator('[data-testid=planned-time]').textContent();
  const box = (await ruler.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 100, y, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('[data-testid=planned-time]')).not.toHaveText(before!);
  await page.screenshot({ path: 'test-results/time-control-open.png' });

  // Now goes back to the real time but keeps the ruler open, to plan again from there.
  await page.locator('[data-testid=time-now]').click();
  await expect(page.locator('[data-testid=time-now]')).toHaveAttribute('disabled', '');
  await expect(ruler).toBeVisible();
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 100, y, { steps: 5 });
  await page.mouse.up();

  // Closed, a band says which time is on show, on every tab.
  await page.locator('[data-testid=close-time]').click();
  await expect(page.locator('[data-testid=planning-band]')).toContainText('Showing');
  // The More button, where the clock is, is amber while the map shows another time.
  await expect(page.getByTestId('more')).toHaveClass(/warn/);
  await page.screenshot({ path: 'test-results/time-control-band.png' });
  await openPage(page, 'Search');
  await expect(page.locator('[data-testid=planning-band]')).toBeVisible();

  // One tap back to the real time, and the band goes.
  await page.locator('[data-testid=band-now]').click();
  await expect(page.locator('[data-testid=planning-band]')).toHaveCount(0);
});

test('changes the Best list as the time changes, and waits with alignment', async ({ page }) => {
  await page.goto('/tabs/lists');
  await page.locator('[data-testid=list-link]', { hasText: 'Best right now' }).click();
  await page.locator('[data-testid=list-change-time]').click();

  // A day later, by the arrow: the list is named for the time it is for.
  await page.locator('[data-testid=next-day]').click();
  await expect(page.locator('[data-testid=list-title]')).toContainText(/Best (at|\w{2,})/);
  // Twelve hours on, by keyboard, turns day into night or night into day: the list changes.
  const first = await page.locator('app-target-list ion-item').allTextContents();
  await page.locator('[data-testid=time-ruler]').focus();
  for (let i = 0; i < 12; i++) await page.keyboard.press('PageUp');
  await expect.poll(() => page.locator('app-target-list ion-item').allTextContents()).not.toEqual(first);
  await page.screenshot({ path: 'test-results/time-control-list.png' });

  // Alignment needs the real sky. A reload would end planning, so by the tab.
  await openPage(page, 'Sky');
  await tapMore(page, 'alignment-status');
  await expect(page.locator('[data-testid=align-planning]')).toBeVisible();
});
