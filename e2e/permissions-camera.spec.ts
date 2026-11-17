import { expect, test } from '@playwright/test';

// The camera's permission, on a phone that has never opened the app.
test.use({ storageState: { cookies: [], origins: [] } });

/** The browser refuses the camera, as it does once the user has pressed Block. */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
  });
});

test('says why first, waits after "Not now", and says how to allow it once blocked', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('permission-reason').getByRole('button', { name: 'Later' }).click();
  await expect(page.getByTestId('permission-reason')).toHaveCount(0);

  // A tap on the rings needs the camera: first, why.
  await page.getByTestId('solve-here').dispatchEvent('click');
  const reason = page.getByTestId('permission-reason');
  await expect(reason).toContainText('Pictures stay on this phone');
  await reason.getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByTestId('solve-toast')).toContainText('Camera not in use yet');
  await expect(page.getByTestId('permission-reason')).toHaveCount(0);

  // Asked again, the reason comes first again, and then the browser, which refuses here.
  await page.getByTestId('solve-here').dispatchEvent('click');
  await page.getByTestId('permission-reason').getByRole('button', { name: 'Continue' }).click();
  const help = page.getByTestId('permission-blocked');
  await expect(help).toContainText('Camera is off');
  await expect(help).toContainText('To turn it on');
  await expect(help).toContainText('Site settings');
});
