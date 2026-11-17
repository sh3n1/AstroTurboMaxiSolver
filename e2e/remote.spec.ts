import type { Browser, BrowserContext, Page } from '@playwright/test';
import { devices, expect, test } from '@playwright/test';

import { moreTile, openPage, tapMore } from './navigation';

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
  await page.addInitScript(() =>
    localStorage.setItem('astroturbomaxisolver.settings', JSON.stringify({ autoSolve: false })),
  );
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
  // Like a phone's browser, the finder refuses full screen unless it was just tapped. The
  // test browser would allow it anyway.
  await finder.addInitScript(() => {
    let tappedAt = -Infinity;
    window.addEventListener('click', () => (tappedAt = performance.now()), true);
    const enter = Element.prototype.requestFullscreen;
    Element.prototype.requestFullscreen = function (options) {
      if (performance.now() - tappedAt > 1000) return Promise.reject(new TypeError('Needs a tap'));
      return enter.call(this, options);
    };
  });

  // The finder shows its code, the screen pastes it and shows a reply, the finder pastes that.
  await finder.goto('/remote');
  await finder.getByTestId('remote-as-finder').click();
  const offer = await shownCode(finder);
  // The screen opens Two phones from the map, as a user does, so the page is a fresh one each time.
  await screen.goto('/');
  await tapMore(screen, 'more-remote');
  await screen.getByTestId('remote-as-screen').click();
  await paste(screen, offer);
  const reply = await shownCode(screen);
  // Scanning the reply hides the finder's own code, and going back shows it again.
  await finder.getByTestId('remote-scan').click();
  await expect(finder.getByTestId('remote-code')).toHaveCount(0);
  await expect(finder.getByText('1. Scan this with the screen phone')).toHaveCount(0);
  await finder.getByTestId('remote-scan-cancel').click();
  await expect(finder.getByTestId('remote-code')).toBeVisible();
  await paste(finder, reply);

  // Linked, both go to the sky map. The screen's sensor button now stands for the finder.
  await expect(screen).toHaveURL(/tabs\/sky/, { timeout: 20_000 });
  await expect(await moreTile(screen, 'sensor-toggle')).toContainText('Finder steers');
  await expect(finder).toHaveURL(/tabs\/sky/, { timeout: 20_000 });

  // Opening Two phones again while linked stays there, to pause or unlink, and doesn't jump back to the map.
  await tapMore(screen, 'more-remote');
  await expect(screen.getByTestId('remote-pause')).toBeVisible();
  await screen.waitForTimeout(1000);
  await expect(screen).toHaveURL(/remote/);
  await screen.getByTestId('remote-open-sky').click();
  await expect(screen).toHaveURL(/tabs\/sky/);

  // The finder shows only the map, with its band in place of the time band and tabs.
  const band = finder.getByTestId('finder-band');
  await expect(band).toContainText('remote mode');
  await expect(finder.getByTestId('open-menu')).toHaveCount(0);
  await expect(finder.getByTestId('zoom-in')).toHaveCount(0);

  // Where the finder's sensors point, the screen shows.
  await sendOrientation(finder, 0, 90, 0);
  await expect(finder.getByTestId('pointing')).toContainText('Alt 0° Az 0°');
  await expect(screen.getByTestId('pointing')).toContainText('Alt 0° Az 0°');
  await expect(screen.getByTestId('finder-sensors-off')).toHaveCount(0);
  // And it follows when the finder moves: poses come on their own channel, glided into place.
  // The finder's sensor fusion only eases towards each compass reading, so it is sent until
  // it is nearly there. Then the screen shows the same.
  await expect(async () => {
    await sendOrientation(finder, 0, 120, 0);
    await expect(finder.getByTestId('pointing')).toContainText(/Alt (29|30)° Az 0°/, { timeout: 200 });
  }).toPass({ timeout: 15_000 });
  await expect(async () => {
    const shown = await finder.getByTestId('pointing').textContent();
    await expect(screen.getByTestId('pointing')).toHaveText(shown!, { timeout: 200 });
  }).toPass({ timeout: 5_000 });

  // Red night mode on the screen turns the finder's screen red too.
  await tapMore(screen, 'night-toggle');
  await expect(finder.locator('html')).toHaveClass(/night/);
  await tapMore(screen, 'night-toggle');
  await expect(finder.locator('html')).not.toHaveClass(/night/);

  // Full screen on the screen phone: the finder follows. Browsers usually want a tap on the
  // finder itself before it may go full screen, so its band asks for one.
  const finderFullscreen = (): Promise<boolean> => finder.evaluate(() => document.fullscreenElement !== null);
  const askTap = finder.getByTestId('finder-fullscreen');
  await tapMore(screen, 'fullscreen-toggle');
  await expect(askTap).toBeVisible();
  expect(await finderFullscreen()).toBe(false);
  // A tap anywhere on the finder does it, not only on the band.
  await finder.locator('app-sky canvas').click({ position: { x: 40, y: 200 } });
  await expect.poll(finderFullscreen).toBe(true);
  await expect(askTap).toHaveCount(0);
  // Leaving it needs no tap on the finder.
  await tapMore(screen, 'fullscreen-toggle');
  await expect.poll(finderFullscreen).toBe(false);

  // A target chosen on the screen is the finder's target too, and clearing it clears both.
  await openPage(screen, 'Search');
  await screen.locator('app-targets ion-searchbar input').fill('Vega');
  await screen.locator('app-targets ion-item').first().click();
  await expect(screen.locator('app-sky canvas')).toHaveAttribute('data-target', 'Vega');
  await expect(finder.locator('app-sky canvas')).toHaveAttribute('data-target', 'Vega');
  await screen.getByTestId('clear-target').click();
  await expect(finder.locator('app-sky canvas')).not.toHaveAttribute('data-target', /.*/);

  // Alignment is done on the screen. The plate solve runs on the finder, whose fake camera
  // sees no stars, and the screen hears why.
  await tapMore(screen, 'alignment-status');
  await screen.getByTestId('alignment-star').first().click();
  await screen.getByTestId('confirm-centred').click();
  await expect(screen.getByTestId('alignment-failed')).toContainText(/no stars|couldn't match/, { timeout: 45_000 });

  // An alignment made on the screen reaches the finder, which uses it.
  await screen.getByTestId('align-simulated').click();
  await expect(screen.getByTestId('alignment-result')).toBeVisible();
  await expect
    .poll(() =>
      finder.evaluate(() => JSON.parse(localStorage.getItem('astroturbomaxisolver.alignment') ?? '{}').value?.method),
    )
    .toBe('simulated');
  await screen.getByTestId('alignment-done').click();

  // The cross on the finder's band pauses remote mode: its own map and buttons come back,
  // and the screen gets its own sensors back, with no warning, since it was meant.
  await finder.getByTestId('finder-exit').click();
  await expect(band).toHaveCount(0);
  await expect(finder.getByTestId('open-menu')).toBeAttached();
  await expect(await moreTile(screen, 'sensor-toggle')).toContainText('Use sensors');
  await tapMore(screen, 'more-remote');
  await expect(screen.getByTestId('remote-status')).toHaveAttribute('data-status', 'paused');
  // Well past the time a silent finder would count as gone: paused, the link waits.
  await screen.waitForTimeout(5000);
  await expect(screen.getByTestId('remote-status')).toHaveAttribute('data-status', 'paused');
  await expect(screen.getByTestId('remote-toast')).toHaveCount(0);

  // Reconnect needs no codes: both phones are linked again, and the finder steers.
  await screen.getByTestId('remote-resume').click();
  await expect(screen).toHaveURL(/tabs\/sky/);
  await expect(band).toBeVisible();
  await expect(await moreTile(screen, 'sensor-toggle')).toContainText('Finder steers');

  // Unlinking ends it for good: the finder says it is no longer linked.
  await tapMore(screen, 'more-remote');
  await screen.getByTestId('remote-disconnect').click();
  await expect(band).toHaveCount(0, { timeout: 20_000 });
  await context.close();
});

test('refuses a code that is not a pairing code', async ({ page }) => {
  await page.goto('/remote');
  await page.getByTestId('remote-as-screen').click();
  await paste(page, 'https://example.com');
  await expect(page.getByTestId('remote-error')).toHaveText("This isn't an AstroTurboMaxiSolver pairing code");
});
