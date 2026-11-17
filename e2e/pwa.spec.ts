// PWA behaviour that only exists in a production build, because the service
// worker is disabled under the dev server. See the production project in
// playwright.config.ts for how the build is served.
import { expect, test } from '@playwright/test';

const starCanvas = 'app-sky canvas:not([data-star-count="0"])';

test('reloads from the service worker while offline', async ({ context, page }) => {
  // Against a published copy the whole app, about 8 MB, comes over the internet first.
  test.setTimeout(120_000);
  // First visit: this is what installs the service worker.
  await page.goto('/');
  await expect(page.locator(starCanvas)).toBeAttached();

  // Wait until the worker is active and controlling this page.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve));
    }
  });

  // The worker reports a normal state before it finishes caching, so wait for
  // every file in the app's prefetch group before cutting the network.
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const manifest = await (await fetch('/ngsw.json?ngsw-cache-bust=' + Date.now())).json();
          const urls: string[] = manifest.assetGroups.find((group: { name: string }) => group.name === 'app').urls;
          const cached = await Promise.all(urls.map((url) => caches.match(url)));
          return cached.every(Boolean);
        }),
      { timeout: 90_000 },
    )
    .toBe(true);

  // Go offline and reload. The page can now only come from the worker's cache.
  await context.setOffline(true);
  const response = await page.reload();

  expect(response?.fromServiceWorker()).toBe(true);
  await expect(page.locator(starCanvas)).toBeAttached();
});

test('offers no device test, which is only for developing the app', async ({ page }) => {
  await page.goto('/tabs/settings');
  await expect(page.getByTestId('app-version')).toBeVisible();
  await expect(page.getByTestId('open-device-test')).toHaveCount(0);
  // Its address goes to the map, like any address the app doesn't have.
  await page.goto('/device-test');
  await expect(page).toHaveURL(/tabs\/sky/);
});

test('serves a complete web app manifest', async ({ page, request }) => {
  // Follow the link from the page, so this also fails if index.html loses it.
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();

  // These fields are what browsers need in order to offer installation.
  const manifest = await (await request.get(`/${href}`)).json();
  expect(manifest.name).toBe('AstroTurboMaxiSolver');
  expect(manifest.display).toBe('fullscreen');
  expect(manifest.icons.map((icon: { purpose: string }) => icon.purpose)).toEqual(
    expect.arrayContaining(['any', 'maskable']),
  );

  // A manifest can look valid while its icons are missing from the build.
  for (const icon of manifest.icons) {
    expect((await request.get(`/${icon.src}`)).ok(), icon.src).toBe(true);
  }
});
