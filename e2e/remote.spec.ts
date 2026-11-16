import type { Browser, BrowserContext, Page } from '@playwright/test';
import { devices, expect, test } from '@playwright/test';

// Two phones are two browsers here, each with its own storage, linked by real WebRTC on
// this machine. The codes are pasted rather than scanned. Chromium's fake camera stands in
// for the finder's, and shows no stars, so its plate solves fail, and say so.
const CAMERA_ARGS = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'];
const PERMISSIONS = ['camera', 'accelerometer', 'gyroscope', 'magnetometer'];
test.use({ permissions: PERMISSIONS, launchOptions: { args: CAMERA_ARGS } });

/** A second phone: a fresh browser context at the same address. */
async function secondPhone(browser: Browser, baseURL: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ ...devices['Pixel 7'], baseURL, permissions: PERMISSIONS });
  return { context, page: await context.newPage() };
}

/** Both phones skip automatic solving, so the fake camera is only used when asked. */
async function noAutoSolve(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('astrofinder.settings', JSON.stringify({ autoSolve: false })));
}

/** The code a phone shows as a QR code. */
async function shownCode(page: Page): Promise<string> {
  const canvas = page.locator('[data-testid=remote-code] canvas');
  await expect(canvas).toHaveAttribute('data-code', /^AF1:/, { timeout: 15_000 });
  return (await canvas.getAttribute('data-code'))!;
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

async function paste(page: Page, code: string): Promise<void> {
  await page.locator('[data-testid=remote-paste] textarea').fill(code);
  await page.getByTestId('remote-paste-submit').click();
}

test('links two phones: the screen follows the finder, and aligns through it', async ({
  page: finder,
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const { context, page: screen } = await secondPhone(browser, String(testInfo.project.use.baseURL));
  await noAutoSolve(finder);
  await noAutoSolve(screen);

  // The finder shows its code, the screen pastes it and shows a reply, the finder pastes that.
  await finder.goto('/remote');
  await finder.getByTestId('remote-as-finder').click();
  const offer = await shownCode(finder);
  await screen.goto('/remote');
  await screen.getByTestId('remote-as-screen').click();
  await paste(screen, offer);
  const reply = await shownCode(screen);
  await paste(finder, reply);

  // Linked, both go to the sky map. The screen's sensor button now stands for the finder.
  const screenSensors = screen.getByTestId('sensor-toggle');
  await expect(screenSensors).toContainText('Steered by the finder phone', { timeout: 20_000 });
  await expect(finder).toHaveURL(/tabs\/sky/, { timeout: 20_000 });

  // The finder shows only the map, with its band in place of the time band and tabs.
  const band = finder.getByTestId('finder-band');
  await expect(band).toContainText('remote mode');
  await expect(finder.getByTestId('sensor-toggle')).toHaveCount(0);
  await expect(finder.getByRole('tab', { name: 'Sky' })).toBeHidden();

  // Where the finder's sensors point, the screen shows.
  await sendOrientation(finder, 0, 90, 0);
  await expect(finder.getByTestId('pointing')).toContainText('Alt 0° Az 0°');
  await expect(screen.getByTestId('pointing')).toContainText('Alt 0° Az 0°');
  await expect(screen.getByTestId('finder-sensors-off')).toHaveCount(0);

  // Red night mode on the screen turns the finder's screen red too.
  await screen.getByTestId('night-toggle').click();
  await expect(finder.locator('html')).toHaveClass(/night/);
  await screen.getByTestId('night-toggle').click();
  await expect(finder.locator('html')).not.toHaveClass(/night/);

  // Alignment is done on the screen. The plate solve runs on the finder, whose fake camera
  // sees no stars, and the screen hears why.
  await screen.getByTestId('alignment-status').click();
  await screen.getByTestId('alignment-star').first().click();
  await screen.getByTestId('confirm-centred').click();
  await expect(screen.getByTestId('alignment-failed')).toContainText('no stars', { timeout: 45_000 });

  // An alignment made on the screen reaches the finder, which uses it.
  await screen.getByTestId('align-simulated').click();
  await expect(screen.getByTestId('alignment-result')).toBeVisible();
  await expect
    .poll(() => finder.evaluate(() => JSON.parse(localStorage.getItem('astrofinder.alignment') ?? '{}').value?.method))
    .toBe('simulated');
  await screen.getByTestId('alignment-done').click();

  // The cross on the finder's band ends remote mode: its own map and buttons come back,
  // and the screen says the finder is gone, and gets its own sensors back.
  await finder.getByTestId('finder-exit').click();
  await expect(band).toHaveCount(0);
  await expect(finder.getByTestId('sensor-toggle')).toBeVisible();
  await expect(screen.getByTestId('remote-toast')).toContainText('Finder phone disconnected', { timeout: 20_000 });
  await expect(screenSensors).toContainText('Use sensors');
  await context.close();
});

test('refuses a code that is not a pairing code', async ({ page }) => {
  await page.goto('/remote');
  await page.getByTestId('remote-as-screen').click();
  await paste(page, 'https://example.com');
  await expect(page.getByTestId('remote-error')).toHaveText("This isn't an AstroFinder pairing code");
});
