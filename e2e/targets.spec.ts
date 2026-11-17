import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

// Finding targets and what the app says about them: search, filters and the details.

/** Chooses a type in the Targets tab's filter sheet, then closes the sheet. */
async function filterTargetsByType(page: Page, type: string | RegExp): Promise<void> {
  await page.locator('app-targets [data-testid=list-filter]').click();
  await page.locator('[data-testid=list-type-filters] ion-chip', { hasText: type }).click();
  await page.locator('[data-testid=filters-close]').click();
  await expect(page.locator('[data-testid=list-filters]')).toHaveCount(0);
}

test('shows target details from the target bar', async ({ page }) => {
  await page.goto('/tabs/targets');
  await page.locator('app-targets ion-searchbar input').fill('M31');
  // Wait for the search to apply, because the list updates just after typing.
  await expect(page.locator('app-targets ion-item').first()).toContainText('M31');
  await page.locator('app-targets ion-item').first().click();
  await expect(page.locator('[data-testid=target-bar]')).toContainText('M31');
  // The details button is filled while the details are open.
  const infoIcon = page.locator('[data-testid=target-info] ion-icon');
  await expect(infoIcon).toHaveAttribute('name', 'information-circle-outline');
  await page.locator('[data-testid=target-info]').click();
  await expect(infoIcon).toHaveAttribute('name', 'information-circle');
  const details = page.locator('[data-testid=target-details]');
  // What it is and where, both of its sizes, and its height through the night.
  await expect(page.locator('[data-testid=details-type]')).toContainText('Spiral galaxy');
  await expect(page.locator('[data-testid=details-constellation]')).toHaveText('Andromeda');
  await expect(details).toContainText('190′ × 60′');
  await expect(page.locator('[data-testid=tonight-chart]')).toBeVisible();
  await expect(page.locator('[data-testid=details-pass]')).toHaveText(
    /Best .+–.+|Low tonight|Not up tonight|Only up in twilight/,
  );
  // How it fits the default 25 mm eyepiece: M31 is wider than its 2° field.
  await expect(page.locator('[data-testid=details-eyepiece]')).toHaveText('Overfills at 26×');
  await expect(page.locator('[data-testid=details-moon]')).toContainText(/Moon down|Bright Moon|No glare/);
  await expect(page.locator('[data-testid=details-where]')).toContainText(/\d+° up|Below the horizon/);
  // NGC 224 and the name are already in the heading, so they aren't repeated below.
  await expect(page.locator('[data-testid=details-names]')).toHaveCount(0);
});

test('describes double stars, named or not, and finds them by catalogue number', async ({ page }) => {
  /** Selects a target from the Targets tab and opens its details. */
  const details = async (search: string, expected: string) => {
    await page.goto('/tabs/targets');
    await page.locator('app-targets ion-searchbar input').fill(search);
    await expect(page.locator('app-targets ion-item').first()).toContainText(expected);
    await page.locator('app-targets ion-item').first().click();
    await page.locator('[data-testid=target-info]').click();
  };

  // A named star that is a double keeps its name, and gains its pair.
  await details('Albireo', 'Albireo');
  await expect(page.locator('[data-testid=details-type]')).toContainText('Double star');
  await expect(page.locator('[data-testid=details-constellation]')).toHaveText('Cygnus');
  await expect(page.locator('[data-testid=details-pair]')).toHaveText(/AB 34″ apart at 54°\s+·\s+line-of-sight pair/);
  await expect(page.locator('[data-testid=target-details]')).toContainText('mag 3.2 and 4.7');
  await expect(page.locator('[data-testid=details-colours]')).toHaveText('Orange and blue-white');
  // The default telescope is 650 mm with a 25 mm eyepiece: 26×.
  await expect(page.locator('[data-testid=details-split]')).toContainText('Splits at 26×');
  await expect(page.locator('[data-testid=details-split]')).toHaveAttribute(
    'title',
    'Splits with your eyepiece, at 26×',
  );

  // One without a name, found by its catalogue number, written either way.
  await details('STF2470', 'STF 2470');
  await expect(page.locator('[data-testid=details-pair]')).toContainText('AB 14″ apart');

  // Mizar and Alcor, the wide pair, too.
  await details('Mizar', 'Mizar');
  await expect(page.locator('[data-testid=details-type]')).toHaveText(/Multiple star/);
  await expect(page.locator('[data-testid=details-pair]').nth(1)).toContainText('AC 12′ apart');
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
  await expect(page.locator('[data-testid=details-type]')).toContainText('Orange-red star');
  await expect(page.locator('[data-testid=details-constellation]')).toHaveText('Orion');

  await details('Jupiter');
  await expect(page.locator('[data-testid=details-distance]')).toContainText(/\d\.\d\d au away · light takes \d+ min/);
  await expect(page.locator('[data-testid=target-details]')).toContainText(/disc \d+″/);

  await details('Moon');
  await expect(page.locator('[data-testid=details-distance]')).toContainText(/ km away · \d\.\d light-seconds/);
  await expect(page.locator('[data-testid=details-moon-phase]')).toContainText(/Age \d+ days · (full|new) Moon/);
  // The Moon gets no note about the Moon.
  await expect(page.locator('[data-testid=details-moon]')).toHaveCount(0);
});

test('filters targets by type', async ({ page }) => {
  await page.goto('/tabs/targets');
  await filterTargetsByType(page, 'Galaxy');
  // A long list shows its first part, and more once its end comes into view.
  await expect(page.locator('app-targets ion-item')).toHaveCount(24);
  await expect(page.locator('app-targets [data-testid=list-rows]')).not.toHaveAttribute('data-total', '24');
  await expect(page.locator('app-targets ion-item', { hasText: 'Vega' })).toHaveCount(0);
  await page.locator('app-targets ion-item').last().scrollIntoViewIfNeeded();
  await expect(page.locator('app-targets ion-item')).toHaveCount(48);
});

test('lists all 88 constellations, and finds one by its abbreviation', async ({ page }) => {
  await page.goto('/tabs/targets');
  await filterTargetsByType(page, 'Constellation');
  await expect(page.locator('app-targets [data-testid=list-rows]')).toHaveAttribute('data-total', '88');
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
      'astroturbomaxisolver.settings',
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
      'astroturbomaxisolver.settings',
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
      'astroturbomaxisolver.settings',
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
  await filterTargetsByType(page, 'Solar system');
  const rows = page.locator('app-targets ion-item');
  // The Moon, seven planets, Pluto, Ceres, Vesta, Pallas and Juno.
  await expect(rows).toHaveCount(13);
  await expect(page.locator('app-targets ion-item', { hasText: 'Jupiter' })).toHaveCount(1);
  await expect(page.locator('app-targets ion-item', { hasText: 'Moon' })).toHaveCount(1);
  await expect(rows.filter({ hasText: 'Pluto' })).toContainText('Dwarf planet');
  await expect(rows.filter({ hasText: 'Ceres' })).toContainText('Dwarf planet');
  await expect(rows.filter({ hasText: 'Vesta' })).toContainText('Asteroid');
  // Each has AstroTurboMaxiSolver's own icon, drawn as lines, and the Moon's shows its phase.
  await expect(rows.locator('[data-testid=target-icon][data-icon=custom]')).toHaveCount(13);
  await expect(rows.filter({ hasText: 'Moon' }).locator('[data-testid=target-icon] svg path')).not.toHaveCount(0);
});

test('shows its own icons for galaxies and nebulae', async ({ page }) => {
  await page.goto('/tabs/targets');
  await filterTargetsByType(page, 'Nebula');
  await expect(page.locator('app-targets [data-testid=target-icon]').first()).toHaveAttribute('data-icon', 'custom');
  await filterTargetsByType(page, 'Galaxy');
  await expect(page.locator('app-targets [data-testid=target-icon]').first()).toHaveAttribute('data-icon', 'custom');
  // Exactly "Star", not "Double star". Plain stars have the standard star; named stars that
  // are also doubles, such as Albireo, the double star icon. Which comes first depends on
  // the sky at the time, so this only checks that plain stars show theirs.
  await filterTargetsByType(page, /^\s*Star\s*$/);
  await expect(page.locator('app-targets [data-testid=target-icon][data-icon=star-outline]').first()).toBeVisible();
});
