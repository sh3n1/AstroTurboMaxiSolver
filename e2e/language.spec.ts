import { expect, test } from '@playwright/test';

import { openPage } from './navigation';

const SETTINGS_KEY = 'astroturbomaxisolver.settings';

// The phone speaks a language the app doesn't have yet: English, the default, is shown.
test.use({ locale: 'fr-FR' });

test('follows the phone language, with English when the app lacks it, and saves a choice', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  await openPage(page, 'Settings');
  const language = page.getByTestId('language');
  await expect(language).toHaveJSProperty('value', 'auto');
  await expect(language).toContainText('Automatic · English');

  // Choosing a language saves it and reloads the app in it.
  await language.click();
  await page.locator('ion-popover ion-radio', { hasText: /^English$/ }).click();
  await expect(page.getByTestId('language')).toHaveJSProperty('value', 'en');
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).language, SETTINGS_KEY);
  expect(saved).toBe('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});
