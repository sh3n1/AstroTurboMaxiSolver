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
  await expect(page.locator('[data-testid=equatorial]')).toContainText(/RA \d+h \d+m, Dec [+-]\d+°/);
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
  await expect(page.locator('[data-testid=target-details]')).toContainText('across');
  await expect(page.locator('[data-testid=target-details]')).toContainText('NGC 224');
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

test('lists the planets and the Moon', async ({ page }) => {
  await page.goto('/tabs/targets');
  await page.locator('app-targets ion-chip', { hasText: 'Solar system' }).click();
  const rows = page.locator('app-targets ion-item');
  await expect(rows).toHaveCount(8);
  await expect(page.locator('app-targets ion-item', { hasText: 'Jupiter' })).toHaveCount(1);
  await expect(page.locator('app-targets ion-item', { hasText: 'Moon' })).toHaveCount(1);
  // Each has AstroFinder's own icon, drawn as lines, and the Moon's shows its phase.
  await expect(rows.locator('[data-testid=target-icon][data-icon=custom]')).toHaveCount(8);
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
