import { expect, test } from '@playwright/test';

test('visits the app root url', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-testid=view-mode]')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Targets' })).toBeVisible();
});

test('opens on a close zoom with the sky data loaded', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('app-sky canvas');
  await expect(canvas).toHaveAttribute('data-field', '20');
  await expect(page.locator('app-sky canvas:not([data-constellation-count="0"])')).toBeAttached();
  await expect(page.locator('[data-testid=pointing]')).toContainText('Alt');

  // Zoom changes what the canvas shows.
  await page.locator('[data-testid=zoom-out]').click();
  await expect(canvas).toHaveAttribute('data-field', '30');
});

test('shows RA and Dec on the sky map only when chosen in Settings', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-testid=pointing]')).toContainText('Alt');
  await expect(page.locator('[data-testid=equatorial]')).toHaveCount(0);

  await page.getByRole('tab', { name: 'Settings' }).click();
  await expect(page.locator('[data-testid=show-equatorial]')).toHaveAttribute('aria-checked', 'false');
  await page.locator('[data-testid=show-equatorial]').click();
  await page.getByRole('tab', { name: 'Sky' }).click();
  await expect(page.locator('[data-testid=equatorial]')).toContainText(/RA \d+h \d+m, Dec [+−-]\d+°/);
});

test('shows the location bottom left, only while no target is selected', async ({ page, context }) => {
  // The test's phone is in Madrid. The app has no location of its own until asked.
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 40.4168, longitude: -3.7038 });
  await page.goto('/');
  const location = page.locator('[data-testid=location]');
  await expect(location).toContainText('Location not set');

  // One tap uses the GPS, rounded to two decimals.
  await location.click();
  await expect(location).toHaveText('40.42° N, 3.70° W');

  await page.goto('/tabs/targets');
  await page.locator('app-targets ion-searchbar input').fill('Vega');
  await page.locator('app-targets ion-item', { hasText: 'Vega' }).first().click();
  await expect(page.locator('[data-testid=target-bar]')).toBeVisible();
  await expect(page.locator('[data-testid=location]')).toHaveCount(0);
});

test('shows target details from the target bar', async ({ page }) => {
  await page.goto('/tabs/targets');
  await page.locator('app-targets ion-searchbar input').fill('M31');
  // Wait for the search to apply, because the list updates just after typing.
  await expect(page.locator('app-targets ion-item').first()).toContainText('M31');
  await page.locator('app-targets ion-item').first().click();
  await expect(page.locator('[data-testid=target-bar]')).toContainText('M31');
  await page.locator('[data-testid=target-info]').click();
  const details = page.locator('[data-testid=target-details]');
  // What it is and where, both of its sizes, and when to look tonight.
  await expect(page.locator('[data-testid=details-type]')).toHaveText(/Spiral galaxy\s+· in Andromeda/);
  await expect(details).toContainText('190′ × 60′');
  await expect(page.locator('[data-testid=details-pass]')).toContainText(/Rise|Never sets|Never rises/);
  await expect(page.locator('[data-testid=details-moon]')).toContainText('Moon');
  // NGC 224 and the name are already in the heading, so they aren't repeated below.
  await expect(page.locator('[data-testid=details-names]')).toHaveCount(0);
});

test('describes star colours and solar-system bodies in the details', async ({ page }) => {
  /** Selects a target from the Targets tab and opens its details. */
  const details = async (search: string) => {
    await page.goto('/tabs/targets');
    await page.locator('app-targets ion-searchbar input').fill(search);
    await expect(page.locator('app-targets ion-item').first()).toContainText(search);
    await page.locator('app-targets ion-item').first().click();
    await page.locator('[data-testid=target-info]').click();
  };

  await details('Betelgeuse');
  await expect(page.locator('[data-testid=details-type]')).toHaveText(/Orange-red star\s+· in Orion/);

  await details('Jupiter');
  await expect(page.locator('[data-testid=details-distance]')).toContainText(/\d\.\d\d au away · light takes \d+ min/);
  await expect(page.locator('[data-testid=target-details]')).toContainText(/disc \d+″/);

  await details('Moon');
  await expect(page.locator('[data-testid=details-distance]')).toContainText(/ km away · \d\.\d light-seconds/);
  await expect(page.locator('[data-testid=details-moon-phase]')).toContainText(/Age \d+ days · (full|new) Moon/);
  // The Moon gets no note about the Moon.
  await expect(page.locator('[data-testid=details-moon]')).toHaveCount(0);
});

test('follows the sky turning by the second, not by the minute', async ({ page }) => {
  // A controlled clock, so the test can let time pass without waiting.
  await page.clock.install({ time: new Date('2026-08-15T21:00:00Z') });
  await page.goto('/');
  await page.getByRole('tab', { name: 'Targets' }).click();
  // Altair is near the celestial equator, where the sky moves fastest.
  await page.locator('app-targets ion-searchbar input').fill('Altair');
  await page.locator('app-targets ion-item').first().click();
  await page.locator('[data-testid=aim-at-target]').click();
  await expect(page.locator('[data-testid=guidance]')).toContainText('0.0° away');
  // In 50 seconds the sky turns about 0.2°. A once-a-minute clock would still show 0.0°.
  await page.clock.runFor(50_000);
  await expect(page.locator('[data-testid=guidance]')).toContainText(/0\.[12]° away/);
});

test('finds a target, guides to it and shows it in the eyepiece', async ({ page }) => {
  await page.goto('/');

  // Search for a target and select it, which opens the sky map.
  await page.getByRole('tab', { name: 'Targets' }).click();
  await page.locator('app-targets ion-searchbar input').fill('Vega');
  await expect(page.locator('app-targets ion-item')).toHaveCount(1);
  await page.locator('app-targets ion-item').click();
  await expect(page.locator('[data-testid=guidance]')).toContainText('away');

  // Aiming at it brings the remaining distance to zero.
  await page.locator('[data-testid=aim-at-target]').click();
  await expect(page.locator('[data-testid=guidance]')).toContainText('0.0° away');

  // The eyepiece view opens with its stars.
  await page.locator('[data-testid=view-mode]').click();
  await expect(page.locator('app-sky canvas:not([data-star-count="0"])')).toBeAttached();
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
  await page.locator('[data-testid=night-toggle]').click();
  await expect(page.locator('html')).toHaveClass(/night/);
  await page.locator('[data-testid=night-toggle]').click();
  await expect(page.locator('html')).not.toHaveClass(/night/);
});

test('goes full screen and back from the sky map', async ({ page }) => {
  await page.goto('/');
  const button = page.locator('[data-testid=fullscreen-toggle]');
  const isFullscreen = (): Promise<boolean> => page.evaluate(() => document.fullscreenElement !== null);
  await expect.poll(isFullscreen).toBe(false);
  await button.click();
  await expect.poll(isFullscreen).toBe(true);
  await button.click();
  await expect.poll(isFullscreen).toBe(false);
});

test('keeps the zoom buttons above the target bar', async ({ page }) => {
  await page.goto('/tabs/targets');
  await page.locator('app-targets ion-searchbar input').fill('Vega');
  await expect(page.locator('app-targets ion-item').first()).toContainText('Vega');
  await page.locator('app-targets ion-item').first().click();
  const zoom = await page.locator('[data-testid=zoom-out]').boundingBox();
  const bar = await page.locator('[data-testid=target-bar]').boundingBox();
  expect(zoom!.y + zoom!.height).toBeLessThanOrEqual(bar!.y);
});

test('aligns the telescope on a suggested star', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-testid=alignment-status]')).toContainText('Not aligned');

  // The status on the sky map opens the alignment flow.
  await page.locator('[data-testid=alignment-status]').click();
  const stars = page.locator('[data-testid=alignment-star]');
  await expect(stars.first()).toBeVisible();
  const starName = (await stars.first().locator('h2').innerText()).trim();

  await stars.first().click();
  await page.locator('[data-testid=confirm-centred]').click();

  // This browser has no camera, so plate solving fails and says why.
  await expect(page.locator('[data-testid=alignment-failed]')).toContainText('camera');
  await page.locator('[data-testid=align-simulated]').click();
  await expect(page.locator('[data-testid=alignment-result]')).toContainText('simulated');
  await page.locator('[data-testid=alignment-done]').click();

  // A toast on the sky map confirms it, and the result survives a reload.
  await expect(page.locator('[data-testid=alignment-toast] .toast-message')).toHaveText(`Aligned: ${starName}, rough`);
  await expect(page.locator('[data-testid=alignment-status]')).toContainText(starName);
  await page.reload();
  await expect(page.locator('[data-testid=alignment-status]')).toContainText(starName);
});

test('asks for alignment again after the mount changes', async ({ page }) => {
  await page.goto('/align');
  await page.locator('[data-testid=alignment-star]').first().click();
  await page.locator('[data-testid=confirm-centred]').click();
  await page.locator('[data-testid=align-simulated]').click();
  await page.locator('[data-testid=alignment-done]').click();

  await page.getByRole('tab', { name: 'Settings' }).click();
  await expect(page.locator('[data-testid=open-alignment]')).toContainText('Aligned on');
  await page.evaluate(() => {
    // Selecting through the native picker is slow to drive, so set the value directly.
    document
      .querySelector('[data-testid=mount]')!
      .dispatchEvent(new CustomEvent('ionChange', { detail: { value: 'mirror' }, bubbles: true }));
  });
  await expect(page.locator('[data-testid=open-alignment]')).toContainText('Not aligned');
});

test('filters targets by type', async ({ page }) => {
  await page.goto('/tabs/targets');
  await page.locator('app-targets ion-chip', { hasText: 'Galaxy' }).click();
  await expect(page.locator('app-targets ion-item')).toHaveCount(40);
  await expect(page.locator('[data-testid=more-results]')).toContainText('Showing 40 of');
  await expect(page.locator('app-targets ion-item', { hasText: 'Vega' })).toHaveCount(0);
});

test('lists all 88 constellations, and finds one by its abbreviation', async ({ page }) => {
  await page.goto('/tabs/targets');
  await page.locator('app-targets ion-chip', { hasText: 'Constellation' }).click();
  await expect(page.locator('app-targets ion-item')).toHaveCount(88);
  await expect(page.locator('[data-testid=more-results]')).toHaveCount(0);
  await page.locator('app-targets ion-searchbar input').fill('Ori');
  await expect(page.locator('app-targets ion-item').first()).toContainText('Orion');
  // Aiming at it shows it on the sky map with the crosshair, like any target.
  await page.locator('app-targets ion-item', { hasText: 'Orion' }).first().click();
  await expect(page.locator('[data-testid=target-bar]')).toContainText('Orion');
});

test('finds catalogue objects by name and other designation', async ({ page }) => {
  await page.goto('/tabs/targets');
  const search = page.locator('app-targets ion-searchbar input');
  const rows = page.locator('app-targets ion-item');

  // All 110 Messier objects load, and search looks at other designations too.
  await search.fill('Crab');
  await expect(rows.first()).toContainText('M1');
  await search.fill('NGC 224');
  await expect(rows.first()).toContainText('M31');
  // The space between a catalogue and its number is optional.
  await search.fill('ngc224');
  await expect(rows.first()).toContainText('M31');
  await search.fill('m 31');
  await expect(rows.first()).toContainText('M31');
  // Every catalogue number shows, Messier first.
  await expect(rows.first().locator('[data-testid=designations]')).toHaveText('M31 · NGC 224');

  // Caldwell numbers are searchable, and come before the NGC number.
  await search.fill('C20');
  await expect(rows.first().locator('[data-testid=designations]')).toHaveText('C20 · NGC 7000');
  await search.fill('c 41');
  await expect(rows.first()).toContainText('Hyades');
  // M31 is only listed once, under its Messier name.
  await expect(page.locator('app-targets ion-item h2', { hasText: /^NGC 224$/ })).toHaveCount(0);

  // NGC and IC objects from OpenNGC.
  await search.fill('NGC 7000');
  await expect(rows.first()).toContainText('NGC 7000');
  await search.fill('IC 434');
  await expect(rows.first()).toContainText('IC 434');
});

test('shows how high a target is and which way to face', async ({ page }) => {
  // Polaris stays above the north pole of the sky: due north, as high as the latitude.
  await page.addInitScript(() =>
    localStorage.setItem(
      'astrofinder.settings',
      JSON.stringify({ latitudeDeg: 40, longitudeDeg: 0, locationSet: true }),
    ),
  );
  await page.goto('/tabs/targets');
  await page.locator('app-targets ion-searchbar input').fill('Polaris');
  const badge = page
    .locator('app-targets ion-item', { hasText: 'Polaris' })
    .first()
    .locator('[data-testid=sky-position]');
  await expect(badge).toHaveText(/^(39|40|41)° N$/);
  await expect(badge).toHaveAttribute('aria-label', /° up, to the north$/);
});

test('marks a target below the horizon with a crossed-out eye', async ({ page }) => {
  // Near the North Pole, Canopus far in the southern sky never rises, at any time.
  await page.addInitScript(() =>
    localStorage.setItem(
      'astrofinder.settings',
      JSON.stringify({ latitudeDeg: 85, longitudeDeg: 0, locationSet: true }),
    ),
  );
  await page.goto('/tabs/targets');
  await page.locator('app-targets ion-searchbar input').fill('Canopus');
  const row = page.locator('app-targets ion-item', { hasText: 'Canopus' }).first();
  await expect(row.locator('[data-testid=below-horizon]')).toHaveAttribute('aria-label', 'Below the horizon');
  await expect(row.locator('ion-badge')).toHaveCount(0);
});

test('shows when a target below the horizon will rise', async ({ page }) => {
  // From Valencia at midday in November, Sirius is down, and rises late in the evening.
  await page.clock.install({ time: new Date('2026-11-07T12:00:00Z') });
  await page.addInitScript(() =>
    localStorage.setItem(
      'astrofinder.settings',
      JSON.stringify({ latitudeDeg: 39.47, longitudeDeg: -0.38, locationSet: true }),
    ),
  );
  await page.goto('/tabs/targets');
  await page.locator('app-targets ion-searchbar input').fill('Sirius');
  const row = page.locator('app-targets ion-item', { hasText: 'Sirius' }).first();
  await expect(row.locator('[data-testid=rises-at]')).toHaveAttribute('aria-label', /rises at .*\d:\d\d/);
  await expect(row.locator('[data-testid=rises-at]')).toContainText(/\d:\d\d/);
  await expect(row.locator('[data-testid=below-horizon]')).toHaveCount(0);
});

test('lists the Moon, planets, dwarf planets and bright asteroids', async ({ page }) => {
  await page.goto('/tabs/targets');
  await page.locator('app-targets ion-chip', { hasText: 'Solar system' }).click();
  const rows = page.locator('app-targets ion-item');
  // The Moon, seven planets, Pluto, Ceres, Vesta, Pallas and Juno.
  await expect(rows).toHaveCount(13);
  await expect(page.locator('app-targets ion-item', { hasText: 'Jupiter' })).toHaveCount(1);
  await expect(page.locator('app-targets ion-item', { hasText: 'Moon' })).toHaveCount(1);
  await expect(rows.filter({ hasText: 'Pluto' })).toContainText('Dwarf planet');
  await expect(rows.filter({ hasText: 'Ceres' })).toContainText('Dwarf planet');
  await expect(rows.filter({ hasText: 'Vesta' })).toContainText('Asteroid');
  // Each has AstroFinder's own icon, drawn as lines, and the Moon's shows its phase.
  await expect(rows.locator('[data-testid=target-icon][data-icon=custom]')).toHaveCount(13);
  await expect(rows.filter({ hasText: 'Moon' }).locator('[data-testid=target-icon] svg path')).not.toHaveCount(0);
});

test('shows its own icons for galaxies and nebulae', async ({ page }) => {
  await page.goto('/tabs/targets');
  await page.locator('app-targets ion-chip', { hasText: 'Nebula' }).click();
  await expect(page.locator('app-targets [data-testid=target-icon]').first()).toHaveAttribute('data-icon', 'custom');
  await page.locator('app-targets ion-chip', { hasText: 'Galaxy' }).click();
  await expect(page.locator('app-targets [data-testid=target-icon]').first()).toHaveAttribute('data-icon', 'custom');
  await page.locator('app-targets ion-chip', { hasText: 'Star' }).click();
  await expect(page.locator('app-targets [data-testid=target-icon]').first()).toHaveAttribute(
    'data-icon',
    'star-outline',
  );
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

test('sets star visibility and equipment in the eyepiece view', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-testid=view-mode]').click();
  const label = page.locator('[data-testid=star-limit-label]');

  // A suburban sky, class 5 by default, with the default 130 mm telescope.
  await expect(label).toContainText('12.1');
  await expect(label).toContainText('your sky');
  // The faint stars load once the eyepiece view opens.
  await expect(page.locator('app-sky canvas')).toHaveAttribute('data-star-count', '118216');

  // Moving the slider overrides the sky's value, and the reset brings it back.
  await page.evaluate(() => {
    const range = document.querySelector('[data-testid=star-limit]')!;
    range.dispatchEvent(new CustomEvent('ionInput', { detail: { value: 7 }, bubbles: true }));
  });
  await expect(label).toContainText('7.0');
  await expect(label).not.toContainText('your sky');
  await page.locator('[data-testid=reset-star-limit]').click();
  await expect(label).toContainText('12.1');

  // A bigger aperture shows fainter stars, and both combinations are remembered.
  await page.locator('[data-testid=equipment-toggle]').click();
  const aperture = page.locator('[data-testid=aperture] input:not([disabled])');
  await aperture.fill('200');
  await aperture.blur();
  await expect(label).toContainText('13.1');
  await expect(page.locator('[data-testid=recent-equipment]')).toHaveCount(2);

  // One tap returns to the earlier combination.
  await page.locator('[data-testid=recent-equipment]', { hasText: '130/650' }).click();
  await expect(label).toContainText('12.1');
});

test('sets sky darkness in Settings, which changes the eyepiece view', async ({ page }) => {
  await page.goto('/tabs/settings');
  await expect(page.locator('[data-testid=equipment-moved]')).toBeVisible();
  await page.evaluate(() => {
    const select = document.querySelector('[data-testid=bortle]')!;
    select.dispatchEvent(new CustomEvent('ionChange', { detail: { value: 3 }, bubbles: true }));
  });
  await page.getByRole('tab', { name: 'Sky' }).click();
  await page.locator('[data-testid=view-mode]').click();
  // A rural sky, class 3, with 130 mm: 6.8 plus 6.3 for the aperture.
  await expect(page.locator('[data-testid=star-limit-label]')).toContainText('13.1');
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
  await page.getByRole('tab', { name: 'Sky' }).click();
  expect(await readoutSize()).toBeCloseTo(20.3, 0);
});

test('shows secondary text as brightly as main text at night', async ({ page }) => {
  await page.goto('/tabs/settings');
  await page.locator('[data-testid=night-mode]').click();
  await page.getByRole('tab', { name: 'Sky' }).click();
  const colours = await page.locator('[data-testid=pointing]').evaluate((el) => ({
    readout: getComputedStyle(el).color,
    main: getComputedStyle(document.body).getPropertyValue('--af-text').trim(),
  }));
  expect(colours.readout).toBe('rgb(232, 235, 245)');
  expect(colours.main).toBe('#e8ebf5');
});

test('guides the tube the same way in the eyepiece view as on the sky map', async ({ page }) => {
  await page.goto('/tabs/targets');
  await page.locator('app-targets ion-searchbar input').fill('Vega');
  await expect(page.locator('app-targets ion-item').first()).toContainText('Vega');
  await page.locator('app-targets ion-item').first().click();
  const canvas = page.locator('app-sky canvas');

  // Point the view 3° below the target, using Angular's development tools.
  await page.evaluate(() => {
    const { ng } = window as unknown as {
      ng: {
        getComponent: (el: Element) => {
          state: {
            selectedTarget: () => { raDeg: number; decDeg: number };
            positionOf: (t: unknown) => { altDeg: number; azDeg: number };
            pointing: { set: (p: unknown) => void };
          };
        };
      };
    };
    const { state } = ng.getComponent(document.querySelector('app-sky')!);
    const position = state.positionOf(state.selectedTarget());
    state.pointing.set({ altDeg: Math.min(80, position.altDeg - 3), azDeg: position.azDeg });
  });

  // On the sky map, the target is above, so the guide points up.
  await expect(canvas).toHaveAttribute('data-guide-angle', /^(0|1|2|358|359|360)$/);

  // The default Newtonian turns the image upside down, but the guide still says raise the tube.
  await page.locator('[data-testid=view-mode]').click();
  await expect(canvas).toHaveAttribute('data-guide-angle', /^(0|1|2|358|359|360)$/);

  // Once the target is in the eyepiece, the guide goes away.
  await page.locator('[data-testid=aim-at-target]').click();
  await expect(canvas).not.toHaveAttribute('data-guide-angle', /.*/);
});

test('steps through the sky map, the eyepiece view and the eyepiece ring', async ({ page }) => {
  await page.goto('/');
  const button = page.locator('[data-testid=view-mode]');
  const ring = page.locator('[data-testid=ring-readout]');

  // The sky map, with the Telrad rings and zoom.
  await expect(button).toHaveAttribute('data-mode', 'sky');
  await expect(ring).toHaveCount(0);

  // Then the eyepiece view, which has no zoom: the eyepiece sets the field.
  await button.click();
  await expect(button).toHaveAttribute('data-mode', 'eyepiece');
  await expect(page.locator('[data-testid=zoom-in]')).toHaveCount(0);

  // Then the sky map with one ring the size of the eyepiece's field, still zoomable.
  await button.click();
  await expect(button).toHaveAttribute('data-mode', 'ring');
  await expect(ring).toContainText('Ring');
  await expect(ring).toContainText('×');
  await expect(page.locator('[data-testid=zoom-in]')).toBeVisible();

  // And back to the sky map.
  await button.click();
  await expect(button).toHaveAttribute('data-mode', 'sky');
});
