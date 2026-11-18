import { expect, test } from '@playwright/test';

import { moreTile, openPage, tapMore } from './navigation';

// The eyepiece view: what it shows, its equipment and its guidance.

test('finds a target, guides to it and shows it in the eyepiece', async ({ page }) => {
  await page.goto('/');

  // Search for a target and select it, which opens the sky map.
  await openPage(page, 'Search');
  await page.locator('app-targets ion-searchbar input').fill('Vega');
  await expect(page.locator('app-targets ion-item')).toHaveCount(1);
  await page.locator('app-targets ion-item').click();
  await expect(page.locator('[data-testid=guidance]')).toContainText('away');

  // Aiming at it brings the remaining distance to zero.
  await page.locator('[data-testid=aim-at-target]').click();
  await expect(page.locator('[data-testid=guidance]')).toContainText('0.0° away');

  // The eyepiece view opens with its stars.
  await tapMore(page, 'view-mode');
  await expect(page.locator('app-sky canvas:not([data-star-count="0"])')).toBeAttached();
});

test('sets star visibility and equipment in the eyepiece view', async ({ page }) => {
  await page.goto('/');
  await tapMore(page, 'view-mode');
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

  // The equipment is set in Settings: a bigger telescope, a shorter eyepiece and a Barlow.
  await page.locator('[data-testid=equipment-toggle]').click();
  await page.getByTestId('edit-equipment').click();
  const editor = page.locator('ion-modal app-equipment-editor');
  const fill = async (field: string, value: string) => {
    const input = editor.locator(`[data-testid=${field}] input`);
    await input.fill(value);
  };
  await page.getByTestId('kit-add-telescopes').click();
  await fill('kit-aperture', '200');
  await fill('kit-focal', '1000');
  await editor.getByTestId('kit-save').click();
  await expect(editor).toHaveCount(0);
  await page.getByTestId('kit-add-eyepieces').click();
  // A number outside the sensible range is refused, with the reason.
  await fill('kit-focal', '500');
  await editor.getByTestId('kit-save').click();
  await expect(editor.getByTestId('kit-error')).toContainText('2 to 60');
  await fill('kit-focal', '10');
  await editor.getByTestId('kit-save').click();
  await page.getByTestId('kit-add-modifiers').click();
  await editor.getByTestId('kit-save').click();
  const items = page.getByTestId('kit-item');
  await expect(items).toHaveCount(5);
  await expect(items.filter({ hasText: '2× Barlow' })).toHaveCount(1);

  // The eyepiece view picks from it. A bigger aperture shows fainter stars.
  await openPage(page, 'Sky');
  const toggle = page.getByTestId('equipment-toggle');
  await page.getByTestId('pick-telescope').filter({ hasText: '200/1000' }).click();
  await expect(label).toContainText('13.1');
  await page.getByTestId('pick-eyepiece').filter({ hasText: '10 mm' }).click();
  await expect(toggle).toContainText('100×');
  await page.getByTestId('pick-modifier').filter({ hasText: '2× Barlow' }).click();
  await expect(toggle).toContainText('200/1000 · 10 mm · 2× Barlow · 200×');

  // Deleting the telescope in use goes back to the first, and Undo brings it back. The
  // equipment has a page of its own in Settings.
  await openPage(page, 'Settings');
  await page.getByTestId('open-equipment').click();
  await page.getByRole('button', { name: 'Delete 200/1000' }).click();
  await openPage(page, 'Sky');
  await expect(label).toContainText('12.1');
  await openPage(page, 'Settings');
  await page.getByTestId('open-equipment').click();
  await page.getByTestId('kit-deleted-toast').getByRole('button', { name: 'Undo' }).click();
  await openPage(page, 'Sky');
  await expect(label).toContainText('13.1');
});

test('turns the telescope and eyepieces saved before the kit existed into its first items', async ({ page }) => {
  // Settings as an early version saved them, before the app first starts.
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const old = { telescopeType: 'refractor', telescopeFocalMm: 900, telescopeApertureMm: 102, eyepieceFieldDeg: 52 };
    localStorage.setItem(
      'astroturbomaxisolver.settings',
      JSON.stringify({ ...old, eyepieceFocalMm: 10, recentEquipment: [{ ...old, eyepieceFocalMm: 25 }] }),
    );
  });
  await page.goto('/tabs/settings/equipment');
  await expect(page.getByTestId('kit-item')).toHaveText([/102\/900/, /25 mm/, /10 mm/]);
  await openPage(page, 'Sky');
  await tapMore(page, 'view-mode');
  await expect(page.getByTestId('equipment-toggle')).toContainText('102/900 · 10 mm · 90×');

  // The kit is now in the database, and the settings keep only what is in use, by UUID.
  const settings = await page.evaluate(() => JSON.parse(localStorage.getItem('astroturbomaxisolver.settings')!));
  expect(settings.kit).toBeUndefined();
  expect(settings.telescopeFocalMm).toBeUndefined();
  expect(settings.kitSelection.telescopeId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
  await page.reload();
  await tapMore(page, 'view-mode');
  await expect(page.getByTestId('equipment-toggle')).toContainText('102/900 · 10 mm · 90×');
});

test('sets sky darkness in Settings, which changes the eyepiece view', async ({ page }) => {
  await page.goto('/tabs/settings');
  // Telescope and eyepiece are set in the eyepiece view, not here.
  await expect(page.locator('[data-testid=bortle]')).toBeVisible();
  await expect(page.locator('app-settings')).not.toContainText('Telescope and eyepiece');
  await page.evaluate(() => {
    const select = document.querySelector('[data-testid=bortle]')!;
    select.dispatchEvent(new CustomEvent('ionChange', { detail: { value: 3 }, bubbles: true }));
  });
  await openPage(page, 'Sky');
  await tapMore(page, 'view-mode');
  // A rural sky, class 3, with 130 mm: 6.8 plus 6.3 for the aperture.
  await expect(page.locator('[data-testid=star-limit-label]')).toContainText('13.1');
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
  await tapMore(page, 'view-mode');
  await expect(canvas).toHaveAttribute('data-guide-angle', /^(0|1|2|358|359|360)$/);

  // Once the target is in the eyepiece, the guide goes away.
  await page.locator('[data-testid=aim-at-target]').click();
  await expect(canvas).not.toHaveAttribute('data-guide-angle', /.*/);
});

test('steps through the sky map, the eyepiece view and the eyepiece ring', async ({ page }) => {
  await page.goto('/');
  const button = await moreTile(page, 'view-mode');
  const ring = page.locator('[data-testid=ring-readout]');

  // The sky map, with the three rings and zoom.
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
