// PWA behaviour that only exists in a production build, because the service
// worker is disabled under the dev server, and the landing page, which only the build has.
// The app is at /app/, the landing at the root: see the production project in
// playwright.config.ts for how the build is served.
import { expect, test } from '@playwright/test';

const starCanvas = 'app-sky canvas:not([data-star-count="0"])';

/**
 * For a published copy kept private behind a login: the host's credentials for automated
 * checks, from scripts/deploy.mjs. They go on every request through a route, because the
 * browser's extra headers don't reach the service worker's own downloads, and without them
 * it would get the login page instead of the app.
 */
const deployHeaders = JSON.parse(process.env['DEPLOY_HEADERS'] || '{}') as Record<string, string>;
test.beforeEach(async ({ context }) => {
  if (Object.keys(deployHeaders).length === 0) return;
  await context.route('**/*', (route) =>
    route.continue({ headers: { ...route.request().headers(), ...deployHeaders } }),
  );
});

test('reloads from the service worker while offline', async ({ context, page }) => {
  // Against a published copy the whole app, about 8 MB, comes over the internet first.
  test.setTimeout(120_000);
  // First visit: this is what installs the service worker.
  await page.goto('/app/');
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
          const manifest = await (await fetch('/app/ngsw.json?ngsw-cache-bust=' + Date.now())).json();
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
  await page.goto('/app/tabs/settings');
  await expect(page.getByTestId('app-version')).toBeVisible();
  await expect(page.getByTestId('open-device-test')).toHaveCount(0);
  // Its address goes to the map, like any address the app doesn't have.
  await page.goto('/app/device-test');
  await expect(page).toHaveURL(/app\/tabs\/sky/);
});

test('serves a complete web app manifest', async ({ page, request }) => {
  // Follow the link from the page, so this also fails if index.html loses it.
  await page.goto('/app/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();

  // These fields are what browsers need in order to offer installation.
  const manifest = await (await request.get(`/app/${href}`)).json();
  expect(manifest.name).toBe('AstroTurboMaxiSolver');
  expect(manifest.display).toBe('fullscreen');
  expect(manifest.icons.map((icon: { purpose: string }) => icon.purpose)).toEqual(
    expect.arrayContaining(['any', 'maskable']),
  );

  // A permanent identity, the address the app had before there was one, so installed copies
  // stay the same app.
  expect(manifest.id).toBe('/app/');
  expect(manifest.start_url).toBe('./');

  // A manifest can look valid while its icons are missing from the build. The screenshots,
  // which Android shows in its install dialog, are the landing page's, next to the app.
  const manifestUrl = new URL(`/app/${href}`, page.url());
  const files = [
    ...manifest.icons,
    ...manifest.screenshots,
    ...manifest.shortcuts.flatMap((s: { icons: [] }) => s.icons),
  ];
  for (const file of files as { src: string }[]) {
    const address = new URL(file.src, manifestUrl).pathname;
    expect((await request.get(address)).ok(), address).toBe(true);
  }
  expect(manifest.screenshots.every((s: { form_factor: string }) => s.form_factor === 'narrow')).toBe(true);
});

test('has a landing page at the root, for people and search engines, leading to the app', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('AstroTurboMaxiSolver');
  // What search engines read, and what a shared link shows.
  await expect(page.locator('meta[name=description]')).toHaveAttribute('content', /telescope finder/);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /share\.jpg$/);
  expect(JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!).name).toBe(
    'AstroTurboMaxiSolver',
  );
  await expect(page.getByText('personal project')).toBeVisible();
  // The GPL needs the source code to be reachable from where the app is published.
  await expect(page.locator('a.source-link')).toHaveAttribute('href', /^https:\/\/github\.com\//);
  for (const image of await page.locator('img').all()) {
    expect((await request.get(new URL((await image.getAttribute('src'))!, page.url()).pathname)).ok()).toBe(true);
  }
  expect((await request.get('/robots.txt')).ok()).toBe(true);
  expect((await request.get('/sitemap.xml')).ok()).toBe(true);
  // An address that is neither the landing nor the app is a real "not found".
  expect((await request.get('/no-such-page')).status()).toBe(404);

  // Its button opens the app.
  await page.getByRole('link', { name: 'Open the app' }).first().click();
  await expect(page).toHaveURL(/\/app\/tabs\/sky/);
  await expect(page.locator(starCanvas)).toBeAttached();
});

test("shows the landing in the browser's language, and remembers a language chosen", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, locale: 'es-ES' });
  const page = await context.newPage();

  // A Spanish browser lands on the Spanish page, with its own language and address.
  await page.goto('/');
  await expect(page).toHaveURL(/\/index\.es\.html$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.getByRole('link', { name: 'Abrir la app' }).first()).toBeVisible();
  await expect(page.locator('link[rel=alternate][hreflang=en]')).toHaveAttribute('href', /\/$/);

  // Its legal pages are Spanish too, and say the English text prevails.
  await page.getByRole('link', { name: 'Privacidad' }).click();
  await expect(page).toHaveURL(/\/privacy\.es\.html$/);
  await expect(page.locator('.translation')).toContainText('inglés');

  // Choosing English is remembered: the home page no longer sends this visitor to Spanish.
  await page.getByRole('link', { name: 'English' }).click();
  await expect(page).toHaveURL(/\/privacy\.html$/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('link', { name: 'Open the app' }).first()).toBeVisible();

  // Search engines find every page in both languages.
  const sitemap = await (await page.request.get('/sitemap.xml')).text();
  expect(sitemap).toContain('/index.es.html');
  expect(sitemap).toContain('/terms.es.html');
  await context.close();
});
