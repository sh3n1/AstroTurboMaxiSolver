import { expect, test } from '@playwright/test';

import { THEME, THEME_VARIABLES } from '../src/app/core/theme';

import { moreTile, openMenu, openPage, tapMore } from './navigation';

// The sky map itself and the settings that change how the app looks.

test('visits the app root url', async ({ page }) => {
  await page.goto('/');
  // The map is home: no tab bar and no buttons. A tap on the map opens the menu, with zoom.
  await expect(page.getByTestId('more-sheet')).toHaveCount(0);
  await expect(page.getByRole('tab')).toHaveCount(0);
  await page.locator('app-sky canvas').click({ position: { x: 20, y: 120 } });
  await expect(page.getByTestId('more-sheet')).toBeVisible();
  await expect(page.getByTestId('more-sheet').getByTestId('open-lists')).toBeVisible();
  await expect(page.locator('app-sky .zoom')).not.toHaveClass(/faded/);
  // Another tap on the map closes it, once it has been up a moment, and so does a while without a touch.
  await expect(page.locator('[data-testid=more-sheet][data-ready=true]')).toBeAttached();
  await page.locator('app-sky canvas').click({ position: { x: 20, y: 120 } });
  await expect(page.getByTestId('more-sheet')).toHaveCount(0);
  await expect(page.locator('app-sky .zoom')).toHaveClass(/faded/);
  await page.locator('app-sky canvas').click({ position: { x: 20, y: 120 } });
  await expect(page.getByTestId('more-sheet')).toHaveCount(0, { timeout: 15_000 });
});

test('opens on a close zoom with the sky data loaded', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('app-sky canvas');
  await expect(canvas).toHaveAttribute('data-field', '20');
  await expect(page.locator('app-sky canvas:not([data-constellation-count="0"])')).toBeAttached();
  await expect(page.locator('[data-testid=pointing]')).toContainText('Alt');

  // Zoom, shown with the menu, changes what the canvas shows.
  await openMenu(page);
  await page.locator('[data-testid=zoom-out]').click();
  await expect(canvas).toHaveAttribute('data-field', '30');
});

test('shows RA and Dec on the sky map only when chosen in Settings', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-testid=pointing]')).toContainText('Alt');
  await expect(page.locator('[data-testid=equatorial]')).toHaveCount(0);

  await openPage(page, 'Settings');
  await expect(page.locator('[data-testid=show-equatorial]')).toHaveAttribute('aria-checked', 'false');
  await page.locator('[data-testid=show-equatorial]').click();
  await openPage(page, 'Sky');
  await expect(page.locator('[data-testid=equatorial]')).toContainText(/RA \d+h \d+m, Dec [+−-]\d+°/);
});

test('keeps the screen on while the app is open, and lets go when turned off', async ({ page }) => {
  // Counts the screen locks the app asks for and lets go of, in place of the real API.
  await page.addInitScript(() => {
    const counts = { requested: 0, released: 0 };
    (window as unknown as { wakeCounts: typeof counts }).wakeCounts = counts;
    Object.defineProperty(navigator, 'wakeLock', {
      value: {
        request: async () => {
          counts.requested++;
          const lock = new EventTarget() as EventTarget & { release: () => Promise<void> };
          lock.release = async () => {
            counts.released++;
          };
          return lock;
        },
      },
    });
  });
  await page.goto('/');
  const counts = () => page.evaluate(() => (window as unknown as { wakeCounts: object }).wakeCounts);
  // On by default.
  await expect.poll(counts).toEqual({ requested: 1, released: 0 });

  await openPage(page, 'Settings');
  const toggle = page.locator('[data-testid=keep-screen-on]');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect.poll(counts).toEqual({ requested: 1, released: 1 });
});

test('shows the location bottom left, only while no target is selected', async ({ page, context }) => {
  // The test's phone is in Madrid. The app has no location of its own until asked.
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 40.4168, longitude: -3.7038 });
  await page.goto('/');
  const location = page.locator('[data-testid=location]');
  await expect(location).toContainText('Set location');

  // One tap uses the GPS, rounded to two decimals.
  await location.click();
  await expect(location).toHaveText('40.42° N, 3.70° W');

  await page.goto('/tabs/targets');
  await page.locator('app-targets ion-searchbar input').fill('Vega');
  await page.locator('app-targets ion-item', { hasText: 'Vega' }).first().click();
  await expect(page.locator('[data-testid=target-bar]')).toBeVisible();
  await expect(page.locator('[data-testid=location]')).toHaveCount(0);
});

test('follows the sky turning by the second, not by the minute', async ({ page }) => {
  // A controlled clock, so the test can let time pass without waiting.
  await page.clock.install({ time: new Date('2026-08-15T21:00:00Z') });
  await page.goto('/');
  await openPage(page, 'Search');
  // Altair is near the celestial equator, where the sky moves fastest.
  await page.locator('app-targets ion-searchbar input').fill('Altair');
  await page.locator('app-targets ion-item').first().click();
  await page.locator('[data-testid=aim-at-target]').click();
  await expect(page.locator('[data-testid=guidance]')).toContainText('0.0° away');
  // In 50 seconds the sky turns about 0.2°. A once-a-minute clock would still show 0.0°.
  await page.clock.runFor(50_000);
  await expect(page.locator('[data-testid=guidance]')).toContainText(/0\.[12]° away/);
});

test('remembers night mode after a reload', async ({ page }) => {
  await page.goto('/tabs/settings');
  await page.locator('[data-testid=night-mode]').click();
  await expect(page.locator('html')).toHaveClass(/night/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/night/);
});

test('switches night mode from the sky map', async ({ page }) => {
  await page.goto('/');
  await tapMore(page, 'night-toggle');
  await expect(page.locator('html')).toHaveClass(/night/);
  await tapMore(page, 'night-toggle');
  await expect(page.locator('html')).not.toHaveClass(/night/);
});

test('goes full screen and back from the sky map', async ({ page }) => {
  await page.goto('/');
  const isFullscreen = (): Promise<boolean> => page.evaluate(() => document.fullscreenElement !== null);
  await expect.poll(isFullscreen).toBe(false);
  await tapMore(page, 'fullscreen-toggle');
  await expect.poll(isFullscreen).toBe(true);
  await tapMore(page, 'fullscreen-toggle');
  await expect.poll(isFullscreen).toBe(false);
});

test('greys out full screen in the installed app, which opens full screen already', async ({ page }) => {
  // The installed app, as the manifest opens it.
  await page.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (query: string) =>
      query === '(display-mode: fullscreen)' ? ({ ...real(query), matches: true } as MediaQueryList) : real(query);
  });
  await page.goto('/');
  // It keeps its place in the menu, so the tiles after it don't move, but can't be tapped.
  await expect(await moreTile(page, 'fullscreen-toggle')).toBeDisabled();
});

test('keeps the zoom buttons in the top right corner, clear of the target bar', async ({ page }) => {
  await page.goto('/tabs/targets');
  await page.locator('app-targets ion-searchbar input').fill('Vega');
  await expect(page.locator('app-targets ion-item').first()).toContainText('Vega');
  await page.locator('app-targets ion-item').first().click();
  await openMenu(page);
  const zoom = await page.locator('[data-testid=zoom-out]').boundingBox();
  const bar = await page.locator('[data-testid=target-bar]').boundingBox();
  const width = page.viewportSize()!.width;
  expect(zoom!.y + zoom!.height).toBeLessThanOrEqual(bar!.y);
  expect(zoom!.y).toBeLessThan(200);
  expect(zoom!.x + zoom!.width).toBeGreaterThan(width - 20);
});

test('fades the reticle in and out only while plate solving', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('app-sky canvas');
  await expect(canvas).toHaveAttribute('data-reticle-opacity', '1.00');

  // Angular's development tools reach the app's state, since nothing on this page starts a solve yet.
  const setSolving = (value: boolean): Promise<void> =>
    page.evaluate((solving) => {
      const { ng } = window as unknown as {
        ng: { getComponent: (el: Element) => { state: { plateSolving: { set: (v: boolean) => void } } } };
      };
      ng.getComponent(document.querySelector('app-sky')!).state.plateSolving.set(solving);
    }, value);

  await setSolving(true);
  const seen = new Set<string>();
  await expect
    .poll(async () => {
      seen.add((await canvas.getAttribute('data-reticle-opacity')) ?? '');
      return seen.size;
    })
    .toBeGreaterThan(2);
  const values = [...seen].map(Number);
  expect(Math.min(...values)).toBeLessThan(1);
  expect(Math.min(...values)).toBeGreaterThanOrEqual(0.25);

  await setSolving(false);
  await expect(canvas).toHaveAttribute('data-reticle-opacity', '1.00');
});

test('shows larger text by default, and follows the text size setting', async ({ page }) => {
  await page.goto('/');
  const readoutSize = async (): Promise<number> =>
    page.locator('[data-testid=pointing]').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  // Large is the default: 14 px scaled by 1.2.
  expect(await readoutSize()).toBeCloseTo(16.8, 0);

  await page.goto('/tabs/settings');
  await expect(page.locator('[data-testid=text-size]')).toBeAttached();
  await page.evaluate(() => {
    const select = document.querySelector('[data-testid=text-size]')!;
    select.dispatchEvent(new CustomEvent('ionChange', { detail: { value: 'extra-large' }, bubbles: true }));
  });
  await openPage(page, 'Sky');
  expect(await readoutSize()).toBeCloseTo(20.3, 0);
});

test('shows secondary text as brightly as main text at night', async ({ page }) => {
  await page.goto('/tabs/settings');
  await page.locator('[data-testid=night-mode]').click();
  await openPage(page, 'Sky');
  const colours = await page.locator('[data-testid=pointing]').evaluate((el) => ({
    readout: getComputedStyle(el).color,
    main: getComputedStyle(document.body).getPropertyValue('--af-text').trim(),
  }));
  expect(colours.readout).toBe('rgb(232, 235, 245)');
  expect(colours.main).toBe('#e8ebf5');
});

test('turns the shutter sound for plate solves on and off in Settings', async ({ page }) => {
  await page.goto('/tabs/settings');
  const toggle = page.locator('[data-testid=solve-sound]');
  // Off by default, so a sound never surprises anyone at night.
  await expect(toggle).not.toHaveClass(/toggle-checked/);
  await toggle.click();
  await expect(toggle).toHaveClass(/toggle-checked/);
  await page.reload();
  await expect(page.locator('[data-testid=solve-sound]')).toHaveClass(/toggle-checked/);
});

test('lays out for a phone on its side: the map full screen, and big buttons that never overlap', async ({ page }) => {
  await page.setViewportSize({ width: 860, height: 380 });
  await page.goto('/');
  const box = async (selector: string) => (await page.locator(selector).boundingBox())!;
  const zoom = ['zoom-in', 'zoom-out'];

  // The map keeps the whole screen: there is no tab bar.
  const map = await box('app-sky canvas');
  expect(map.x).toBe(0);
  expect(map.width).toBe(860);
  expect(map.height).toBeGreaterThan(370);
  await expect(page.getByRole('tab')).toHaveCount(0);

  // In the eyepiece view, the panel leaves the circle's place clear.
  await tapMore(page, 'view-mode');
  const panel = await box('[data-testid=eyepiece-panel]');
  expect(panel.x + panel.width).toBeLessThan(860 / 2 + 40);
  // The menu's tiles all fit on the screen, big enough to find in the dark.
  for (const id of ['sensor-toggle', 'view-mode', 'open-lists', 'open-settings']) {
    const tile = await box(`[data-testid=more-sheet] [data-testid=${id}]`);
    expect(tile.height, id).toBeGreaterThanOrEqual(56);
    expect(tile.y, id).toBeGreaterThanOrEqual(0);
    expect(tile.y + tile.height, id).toBeLessThanOrEqual(380);
  }
  await tapMore(page, 'view-mode');
  await tapMore(page, 'view-mode');

  // With the menu, zoom lies in the top right corner, takes its taps, and is big enough to find.
  for (const id of zoom) {
    const onTop = await page.evaluate((testid) => {
      const button = document.querySelector(`[data-testid=${testid}]`)!;
      const { x, y, width, height } = button.getBoundingClientRect();
      return button.contains(document.elementFromPoint(x + width / 2, y + height / 2));
    }, id);
    expect(onTop, id).toBe(true);
    const button = await box(`[data-testid=${id}]`);
    expect(button.height, id).toBeGreaterThanOrEqual(56);
    expect(button.x + button.width, id).toBeGreaterThan(860 - 20);
  }

  // With the time control open the map is shorter, and zoom still fits above it.
  await tapMore(page, 'open-time');
  await expect(page.locator('[data-testid=time-ruler]')).toBeVisible();
  const ruler = await box('[data-testid=time-ruler]');
  for (const id of zoom) {
    const button = await box(`[data-testid=${id}]`);
    expect(button.y, id).toBeGreaterThanOrEqual(0);
    expect(button.y + button.height, id).toBeLessThanOrEqual(ruler.y + 1);
    expect(button.x + button.width, id).toBeLessThanOrEqual(860);
  }
  // The ruler shares its line with the day and the buttons.
  const now = await box('[data-testid=time-now]');
  expect(ruler.x).toBeGreaterThan(now.x);
});

test('draws its canvases in the same colours as the theme', async ({ page }) => {
  // The canvases take their colours from code, the rest of the app from CSS variables.
  await page.goto('/tabs/sky');
  for (const [name, variable] of Object.entries(THEME_VARIABLES)) {
    const value = await page.evaluate(
      (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim(),
      variable,
    );
    expect(value, variable).toBe(THEME[name as keyof typeof THEME]);
  }
});

test('ignores a double tap on the map that lands on a tile as the menu appears', async ({ page }) => {
  await page.goto('/');
  // Where the night tile appears, found with the menu open, then closed again.
  await openMenu(page);
  const tile = (await page.getByTestId('more-sheet').getByTestId('night-toggle').boundingBox())!;
  await page.locator('app-sky canvas').click({ position: { x: 20, y: 120 } });
  await expect(page.getByTestId('more-sheet')).toHaveCount(0);

  // A double tap there: the first opens the menu, the second lands on the tile and is ignored.
  await page.mouse.dblclick(tile.x + tile.width / 2, tile.y + tile.height / 2);
  await expect(page.getByTestId('more-sheet')).toBeVisible();
  await expect(page.locator('html')).not.toHaveClass(/night/);

  // A moment later the tile works.
  await expect(page.locator('[data-testid=more-sheet][data-ready=true]')).toBeAttached();
  await page.mouse.click(tile.x + tile.width / 2, tile.y + tile.height / 2);
  await expect(page.locator('html')).toHaveClass(/night/);
});
