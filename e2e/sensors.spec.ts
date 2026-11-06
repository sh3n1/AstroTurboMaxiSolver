import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

// Chromium's fake camera stands in for a real one, so the test page's flow can be
// checked here. Real limits can only be measured on a real phone.
test.use({
  permissions: ['camera', 'accelerometer', 'gyroscope', 'magnetometer'],
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
});

// Automatic plate solving opens the camera and a solver whenever the phone is still. Tests
// about other things turn it off, so they stay quick and don't compete for the fake camera.
test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.title.includes('plate solves automatically')) return;
  await page.addInitScript(() => localStorage.setItem('astrofinder.settings', JSON.stringify({ autoSolve: false })));
});

/** Turns sensors on, waiting until they are listening, since asking permission takes a moment. */
async function startSensors(page: Page): Promise<void> {
  await page.locator('[data-testid=sensor-toggle]').click();
  await expect(page.locator('[data-testid=sensor-toggle]')).toContainText('Sensors on');
}

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
  await startSensors(page);

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
  await expect(page.locator('[data-testid=sensor-toggle]')).toContainText('Use sensors');
  await page.mouse.move(box!.x + 100, box!.y + 200);
  await page.mouse.down();
  await page.mouse.move(box!.x + 200, box!.y + 300, { steps: 3 });
  await page.mouse.up();
  await expect(pointing).not.toContainText('Alt 0°, az 0°');
});

test('explains when no sensor data arrives', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-testid=sensor-toggle]').click();
  await expect(page.locator('[data-testid=sensor-error]')).toContainText('No sensor data', { timeout: 6000 });
  await expect(page.locator('[data-testid=sensor-toggle]')).toContainText('Use sensors');
});

test('aligns using the real sensor reading', async ({ page }) => {
  await page.goto('/');
  await startSensors(page);
  await sendOrientation(page, 0, 90, 0);
  await page.locator('[data-testid=alignment-status]').click();
  await page.locator('[data-testid=alignment-star]').first().click();
  await expect(page.locator('[data-testid=alignment-source]')).toContainText('plate solves');
  await page.locator('[data-testid=confirm-centred]').click();

  // The fake camera shows no stars, so plate solving honestly fails and offers the sensors.
  await expect(page.locator('[data-testid=alignment-failed]')).toContainText(/no stars|couldn't match/);
  await page.locator('[data-testid=align-with-sensors]').click();
  await expect(page.locator('[data-testid=alignment-result]')).toContainText('according to the sensors');
  await page.locator('[data-testid=alignment-done]').click();
  await expect(page.locator('[data-testid=alignment-status]')).toContainText('rough');
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

/** Sends gyroscope readings at about the rate a phone does. */
async function sendGyroscope(page: Page, alpha: number, beta: number, gamma: number, readings: number): Promise<void> {
  await page.evaluate(
    async ([a, b, g, count]) => {
      for (let i = 0; i < count; i++) {
        window.dispatchEvent(
          new DeviceMotionEvent('devicemotion', { rotationRate: { alpha: a, beta: b, gamma: g }, interval: 16 }),
        );
        await new Promise((resolve) => setTimeout(resolve, 16));
      }
    },
    [alpha, beta, gamma, readings],
  );
}

test('follows the gyroscope between orientation readings', async ({ page }) => {
  await page.goto('/');
  const pointing = page.locator('[data-testid=pointing]');
  await startSensors(page);
  await sendOrientation(page, 0, 90, 0);
  await expect(pointing).toContainText('Alt 0°, az 0°');

  // Spinning about the top of the phone turns it left, from north towards west.
  await sendGyroscope(page, 0, 60, 0, 30);
  const text = await pointing.innerText();
  const azimuth = Number(/az (\d+)/.exec(text)?.[1]);
  expect(azimuth).toBeGreaterThan(300);
  expect(azimuth).toBeLessThan(359);
});

test('notices when the phone has stopped moving', async ({ page }) => {
  await page.goto('/');
  const pointing = page.locator('[data-testid=pointing]');
  await startSensors(page);
  await sendOrientation(page, 0, 90, 0);
  await sendGyroscope(page, 0, 0, 0, 80);
  await expect(pointing).toHaveAttribute('data-still', 'true');

  await sendGyroscope(page, 0, 20, 0, 3);
  await expect(pointing).toHaveAttribute('data-still', 'false');
});

test('runs the clear-sky test without crashing, and reports not solved', async ({ page }) => {
  // The fake camera shows no stars, so this checks the flow. The solving itself is
  // covered in plate-solver.spec.ts, using images rendered from the real catalogue.
  test.setTimeout(120_000);
  await page.goto('/tabs/settings');
  await page.locator('[data-testid=open-device-test]').click();
  await page.locator('[data-testid=run-sky-test]').click();

  // There is time to position the phone before capturing starts.
  await expect(page.locator('[data-testid=sky-test-countdown]')).toContainText('5');
  await expect(page.locator('[data-testid=sky-test-countdown]')).toContainText('1', { timeout: 7000 });
  await expect(page.locator('[data-testid=sky-test-countdown]')).toHaveCount(0, { timeout: 3000 });
  await expect(page.locator('[data-testid=sky-test-summary]')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('[data-testid=sky-test-step]')).toHaveCount(4);
  await expect(page.locator('[data-testid=sky-test-error]')).toHaveCount(0);
  await expect(page.locator('[data-testid=sky-test-solved]')).toHaveCount(0);
  await expect(page.locator('[data-testid=save-sky-report]')).toBeVisible();
});

test('plate solves automatically when the phone is still', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await startSensors(page);
  await sendOrientation(page, 0, 120, 0);
  // Keep the phone still long enough to count, then for the capture.
  const toast = page.locator('[data-testid=solve-toast]');
  for (let i = 0; i < 12 && (await toast.count()) === 0; i++) {
    await sendGyroscope(page, 0, 0, 0, 60);
  }
  // The fake camera has no stars, so the honest answer is no solve, told in a toast.
  await expect(toast.locator('.toast-message')).toHaveText(/No stars|No match/);
});

test('does not use the camera when automatic solving is off', async ({ page }) => {
  // Automatic solving is switched off for this test, before the page loads.
  await page.goto('/tabs/settings');
  await expect(page.locator('[data-testid=auto-solve]')).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('tab', { name: 'Sky' }).click();
  await startSensors(page);
  await sendOrientation(page, 0, 120, 0);
  await expect(page.locator('[data-testid=sensor-toggle]')).toContainText('Sensors on');
  // Hold still long enough that a solve would have run and failed, if it were going to.
  await sendGyroscope(page, 0, 0, 0, 90);
  await page.waitForTimeout(3000);
  await expect(page.locator('[data-testid=solve-toast]')).toHaveCount(0);
});
