import { expect, test } from '@playwright/test';

// Asking for permissions, on a phone that has never opened the app: each is asked for when it
// is first needed, after a line saying why, and a refusal says how to undo it.
test.use({ storageState: { cookies: [], origins: [] } });

test('welcomes the first time, offering to use the location, and only once', async ({ page }) => {
  await page.goto('/');
  const welcome = page.getByTestId('permission-reason');
  await expect(welcome).toContainText('Welcome');
  await expect(welcome).toContainText('Where are you?');
  await welcome.getByRole('button', { name: 'Later' }).click();
  await expect(welcome).toHaveCount(0);
  await expect(page.getByTestId('location')).toContainText('Set location');

  await page.reload();
  await expect(page.locator('app-sky canvas')).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByTestId('permission-reason')).toHaveCount(0);
});

test.describe('with the location allowed', () => {
  test.use({ permissions: ['geolocation'], geolocation: { latitude: 39.47, longitude: -0.38 } });

  test('sets the location from the welcome', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('permission-reason').getByRole('button', { name: 'Use my location' }).click();
    await expect(page.getByTestId('location')).toHaveText('39.47° N, 0.38° W');
  });
});

test('says how to allow the location again once it is blocked', async ({ page }) => {
  // Not allowed in this browser, as if the user had pressed Block.
  await page.goto('/');
  await page.getByTestId('permission-reason').getByRole('button', { name: 'Use my location' }).click();
  const help = page.getByTestId('permission-blocked');
  await expect(help).toContainText('Location is off');
  await expect(help).toContainText('Chrome');
  await help.getByRole('button', { name: 'Got it' }).click();

  // The location button says so too, and asks the browser straight away next time.
  await page.getByTestId('location').click();
  await expect(page.getByTestId('location')).toContainText('Location off');
});
