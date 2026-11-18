import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

const SETTINGS_KEY = 'astroturbomaxisolver.settings';

/** The settings as saved. */
function savedSettings(page: Page): Promise<{ bortle: number; bortleAuto: boolean }> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SETTINGS_KEY);
}

test.beforeEach(async ({ page }) => {
  // Central Valencia, the app's reference city sky.
  await page.addInitScript((key) => {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify({ latitudeDeg: 39.47, longitudeDeg: -0.376, locationSet: true }));
    }
  }, SETTINGS_KEY);
});

test('sets the Bortle class from the location with the light pollution atlas', async ({ page }) => {
  await page.goto('/tabs/settings');
  await expect(page.getByTestId('sky-brightness')).toContainText('17.2 mag/arcsec²');
  await expect(page.getByTestId('bortle')).toContainText('Auto · 9: inner city sky');
  // Saved for the rest of the app, which reads the class from the settings.
  await expect.poll(async () => (await savedSettings(page)).bortle).toBe(9);
});

test('stops following the atlas once a class is chosen by hand, and follows it again on Auto', async ({ page }) => {
  await page.goto('/tabs/settings');
  await expect.poll(async () => (await savedSettings(page)).bortle).toBe(9);
  const choose = (value: number | 'auto') =>
    page.evaluate((detail) => {
      const select = document.querySelector('[data-testid=bortle]')!;
      select.dispatchEvent(new CustomEvent('ionChange', { detail: { value: detail }, bubbles: true }));
    }, value);

  await choose(4);
  await page.reload();
  await expect(page.getByTestId('sky-brightness')).toBeVisible();
  expect(await savedSettings(page)).toMatchObject({ bortle: 4, bortleAuto: false });

  await choose('auto');
  await expect.poll(async () => (await savedSettings(page)).bortle).toBe(9);
  expect((await savedSettings(page)).bortleAuto).toBe(true);
});
