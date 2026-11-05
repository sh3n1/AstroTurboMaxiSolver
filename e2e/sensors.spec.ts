import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

// Chromium's fake camera stands in for a real one, so the test page's flow can be
// checked here. Real limits can only be measured on a real phone.
test.use({
  permissions: ['camera', 'accelerometer', 'gyroscope', 'magnetometer'],
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
});

/** Sends the browser the same event a phone's orientation sensor would. */
async function sendOrientation(page: Page, alpha: number, beta: number, gamma: number): Promise<void> {
  await page.evaluate(
    ([a, b, g]) =>
      window.dispatchEvent(
        new DeviceOrientationEvent('deviceorientationabsolute', { alpha: a, beta: b, gamma: g, absolute: true }),
      ),
    [alpha, beta, gamma],
  );
}

test('moves the map with the phone sensors', async ({ page }) => {
  await page.goto('/');
  const pointing = page.locator('[data-testid=pointing]');
  await page.locator('[data-testid=sensor-toggle]').click();

  // Upright with the top up, looking north at the horizon.
  await sendOrientation(page, 0, 90, 0);
  await expect(pointing).toContainText('Alt 0°, az 0°');

  // Dragging must not fight the sensors while they are on.
  const box = await page.locator('app-sky canvas').boundingBox();
  await page.mouse.move(box!.x + 100, box!.y + 200);
  await page.mouse.down();
  await page.mouse.move(box!.x + 200, box!.y + 300, { steps: 3 });
  await page.mouse.up();
  await expect(pointing).toContainText('Alt 0°, az 0°');

  // Turning sensors off returns control to dragging.
  await page.locator('[data-testid=sensor-toggle]').click();
  await expect(pointing).toContainText('drag to aim');
});

test('explains when no sensor data arrives', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-testid=sensor-toggle]').click();
  await expect(page.locator('[data-testid=sensor-error]')).toContainText('No sensor data', { timeout: 6000 });
  await expect(page.locator('[data-testid=pointing]')).toContainText('drag to aim');
});

test('aligns using the real sensor reading', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-testid=sensor-toggle]').click();
  await sendOrientation(page, 0, 90, 0);
  await page.locator('[data-testid=alignment-status]').click();
  await page.locator('[data-testid=alignment-star]').first().click();
  await expect(page.locator('[data-testid=alignment-source]')).toContainText("Using your phone's sensors");
  await page.locator('[data-testid=confirm-centred]').click();
  await expect(page.locator('[data-testid=alignment-result]')).toContainText('according to the sensors');
});

test('runs the camera test and produces a report', async ({ page }) => {
  await page.goto('/tabs/settings');
  await page.locator('[data-testid=open-device-test]').click();
  await page.locator('[data-testid=run-camera-test]').click();
  const report = page.locator('[data-testid=test-report]');
  await expect(report).toContainText('"cameras"', { timeout: 30_000 });
  await expect(page.locator('[data-testid=test-error]')).toHaveCount(0);

  const parsed = JSON.parse((await report.innerText()).trim());
  expect(parsed.cameras.length).toBeGreaterThan(0);
  expect(parsed.cameras[0].error).toBeUndefined();
});
