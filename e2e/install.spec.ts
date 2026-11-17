import type { Page } from '@playwright/test';
import { devices, expect, test } from '@playwright/test';

import { moreTile } from './navigation';

// Installing the app on the home screen. Chrome only offers to install a real, served app,
// so on Android the tests give the page the same event Chrome would, with a dialog that
// says yes.

/** Chrome's install event, as Chrome sends it once the app can be installed. */
async function offerInstall(page: Page, outcome: 'accepted' | 'dismissed' = 'accepted'): Promise<void> {
  await page.evaluate((choice) => {
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: async () => {
        (window as unknown as { installDialogShown: boolean }).installDialogShown = true;
      },
      userChoice: Promise.resolve({ outcome: choice }),
    });
    window.dispatchEvent(event);
  }, outcome);
}

test('offers to install on Android, until it is installed', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('app-sky canvas')).toBeVisible();
  // Nothing until the browser says the app can be installed.
  await expect(page.getByTestId('install-app')).toHaveCount(0);

  await offerInstall(page);
  const button = page.getByTestId('install-app');
  await expect(button).toHaveText('Install app');
  await button.click();
  expect(await page.evaluate(() => (window as unknown as { installDialogShown?: boolean }).installDialogShown)).toBe(
    true,
  );
  // Installed: nothing more to offer, here or in the menu.
  await expect(button).toHaveCount(0);
  await expect(await moreTile(page, 'sensor-toggle')).toBeVisible();
  await expect(page.getByTestId('install-tile')).toHaveCount(0);
});

test("offers it again on the next visit when Chrome's dialog was turned down", async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('app-sky canvas')).toBeVisible();
  await offerInstall(page, 'dismissed');
  await page.getByTestId('install-app').click();
  // Chrome's offer is used up until it makes another.
  await expect(page.getByTestId('install-app')).toHaveCount(0);

  await page.reload();
  await expect(page.locator('app-sky canvas')).toBeVisible();
  await offerInstall(page);
  await expect(page.getByTestId('install-app')).toBeVisible();
  // The menu has it too.
  await (await moreTile(page, 'install-tile')).click();
  expect(await page.evaluate(() => (window as unknown as { installDialogShown?: boolean }).installDialogShown)).toBe(
    true,
  );
});

test.describe('on an iPhone', () => {
  test.use({ userAgent: devices['iPhone 15'].userAgent });

  test('shows the steps to add the app from the Share menu', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('app-sky canvas')).toBeVisible();
    await page.getByTestId('install-app').click();
    const steps = page.getByTestId('install-steps');
    await expect(steps).toContainText('Share');
    await expect(steps).toContainText('Add to Home Screen');
    await page.getByTestId('install-steps-close').click();
    await expect(steps).toHaveCount(0);

    // The menu opens the same steps.
    await (await moreTile(page, 'install-tile')).click();
    await expect(page.getByTestId('install-steps')).toBeVisible();
  });

  test('offers nothing once it runs from the home screen', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));
    await page.goto('/');
    await expect(page.locator('app-sky canvas')).toBeVisible();
    await page.waitForTimeout(300);
    await expect(page.getByTestId('install-app')).toHaveCount(0);
    await expect(await moreTile(page, 'sensor-toggle')).toBeVisible();
    await expect(page.getByTestId('install-tile')).toHaveCount(0);
  });
});
