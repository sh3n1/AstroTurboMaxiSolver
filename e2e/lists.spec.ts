import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

/** The row for a list on the Bookmarks tab. */
const listLink = (page: Page, name: string) => page.locator('[data-testid=list-link]', { hasText: name });

/** Searches the Targets tab and opens the bookmark sheet for the first result. */
async function bookmarkFromTargets(page: Page, search: string): Promise<void> {
  await page.goto('/tabs/targets');
  await page.locator('app-targets ion-searchbar input').fill(search);
  await expect(page.locator('app-targets ion-item').first()).toContainText(search);
  await page.locator('app-targets [data-testid=bookmark]').first().click();
  await expect(page.locator('ion-modal [data-testid=bookmark-list]').first()).toBeVisible();
}

test('shows the Best right now collection, and the Messier and Caldwell catalogues', async ({ page }) => {
  await page.goto('/tabs/lists');
  await expect(listLink(page, 'Best right now')).toBeVisible();
  await expect(listLink(page, 'Uncategorized')).toBeVisible();

  // The catalogues have their own page.
  await page.locator('[data-testid=catalogues-link]').click();
  const catalogues = page.locator('app-catalogues');
  await expect(catalogues.locator('ion-title')).toHaveText('Catalogues');
  await expect(catalogues.locator('[data-testid=list-link]', { hasText: 'Messier' }).locator('ion-badge')).toHaveText(
    '110',
  );
  // 109 Caldwell numbers, but C14, the Double Cluster, is two objects.
  await expect(catalogues.locator('[data-testid=list-link]', { hasText: 'Caldwell' }).locator('ion-badge')).toHaveText(
    '110',
  );
  // Two objects are listed under two NGC numbers each, and get a row for each.
  await expect(
    catalogues.locator('[data-testid=list-link]', { hasText: 'Herschel 400' }).locator('ion-badge'),
  ).toHaveText('400');
  await expect(
    catalogues.locator('[data-testid=list-link]', { hasText: 'Herschel II' }).locator('ion-badge'),
  ).toHaveText('400');
  // 111 rows: the Double Cluster's two halves each have one.
  await expect(
    catalogues.locator('[data-testid=list-link]', { hasText: 'SAC 110 Best NGC' }).locator('ion-badge'),
  ).toHaveText('111');
  for (const [name, count] of [
    ['Explore the Universe', '45'],
    ['Urban', '87'],
    ['ASSA Top-100', '100'],
  ]) {
    await expect(catalogues.locator('[data-testid=list-link]', { hasText: name }).locator('ion-badge')).toHaveText(
      count,
    );
  }

  // The RASC Finest NGC opens a page of its seasons: 110 objects and 7 companions.
  await page.locator('[data-testid=catalogue-group-link]', { hasText: 'RASC Finest NGC' }).click();
  const seasons = page.locator('app-catalogues', { has: page.locator('ion-title', { hasText: 'RASC Finest NGC' }) });
  for (const [season, count] of [
    ['Autumn sky', '23'],
    ['Winter sky', '18'],
    ['Spring sky', '54'],
    ['Summer sky', '22'],
  ]) {
    await expect(seasons.locator('[data-testid=list-link]', { hasText: season }).locator('ion-badge')).toHaveText(
      count,
    );
  }
  await page.goto('/tabs/lists');
  await expect(listLink(page, 'Uncategorized')).toBeVisible();

  // Each split catalogue has its own page of lists.
  for (const [group, list, count] of [
    ['RASC Deep-Sky Gems', 'Spring sky', '79'],
    // The default location is on the equator, so the northern list: nine objects in November.
    ['Hubble Night Sky Challenge', 'November', '9'],
  ]) {
    await page.goto('/tabs/lists/catalogues');
    await page.locator('[data-testid=catalogue-group-link]', { hasText: group }).click();
    const lists = page.locator('app-catalogues', { has: page.locator('ion-title', { hasText: group }) });
    await expect(lists.locator('[data-testid=list-link]', { hasText: list }).locator('ion-badge')).toHaveText(count);
  }
  await page.goto('/tabs/lists');
  await expect(listLink(page, 'Uncategorized')).toBeVisible();

  // Something is always well up, by day or night: at least the brightest objects.
  await listLink(page, 'Best right now').click();
  await expect(page.locator('app-target-list ion-item').first()).toBeVisible();
});

test('lists what is inside the reticle, following the telescope', async ({ page }) => {
  await page.goto('/tabs/lists');
  await expect(listLink(page, 'In the reticle')).toBeVisible();
  await listLink(page, 'In the reticle').click();
  await expect(page.locator('[data-testid=reticle-centre]')).toContainText('Alt');

  /** Points the telescope at a target's position, plus an offset, using Angular's development tools. */
  const aimNear = (id: string, offsetDeg: number) =>
    page.evaluate(
      ([targetId, offset]) => {
        type Position = { altDeg: number; azDeg: number };
        const { ng } = window as unknown as {
          ng: {
            getComponent: (el: Element) => {
              state: {
                targets: () => { id: string }[];
                positionOf: (t: unknown) => Position;
                pointing: { set: (p: Position) => void };
              };
            };
          };
        };
        const { state } = ng.getComponent(document.querySelector('app-list')!);
        const position = state.positionOf(state.targets().find((t) => t.id === targetId));
        state.pointing.set({ altDeg: position.altDeg + offset, azDeg: position.azDeg });
      },
      [id, offsetDeg] as const,
    );

  // Half a degree from Vega, it is in the list, and first, as nothing else is that close.
  await aimNear('Vega', 0.5);
  const rows = page.locator('app-list app-target-list ion-item');
  await expect(rows.first().locator('[data-testid=designations]')).toContainText('Vega');

  // Ten degrees away, it has left the rings, so the list follows without any tap.
  await aimNear('Vega', 10);
  await expect(page.locator('app-list [data-testid=designations]', { hasText: 'Vega' })).toHaveCount(0);

  // It can't be edited, only copied, like the app's other lists.
  await page.locator('[data-testid=list-actions]').click();
  await expect(page.locator('ion-action-sheet')).toContainText('Make an editable copy');
  await expect(page.locator('ion-action-sheet')).not.toContainText('Rename');
});

test('lists a catalogue in order, and searches inside it', async ({ page }) => {
  await page.goto('/tabs/lists/catalogues');
  await listLink(page, 'Caldwell').click();
  const rows = page.locator('app-list app-target-list ion-item');
  await expect(rows.first().locator('[data-testid=designations]')).toHaveText('C1 · NGC 188');

  await page.locator('[data-testid=list-search] input').fill('North America');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('C20 · NGC 7000');
});

test('saves a bookmark to Uncategorized, or to a new list', async ({ page }) => {
  await bookmarkFromTargets(page, 'Vega');
  await page.locator('ion-modal [data-testid=bookmark-list]', { hasText: 'Uncategorized' }).click();
  await page.locator('[data-testid=bookmark-done]').click();
  await expect(page.locator('app-targets [data-testid=bookmark] ion-icon').first()).toHaveAttribute('name', 'bookmark');

  // A new list made from the sheet gets the target straight away.
  await bookmarkFromTargets(page, 'M31');
  await page.locator('[data-testid=bookmark-new-list]').click();
  await page.locator('ion-alert input').fill('Autumn');
  await page.locator('ion-alert button', { hasText: 'Create' }).click();
  // Let the dialog finish closing before closing the sheet under it.
  await expect(page.locator('ion-alert')).toHaveCount(0);
  await expect(page.locator('ion-modal [data-testid=bookmark-list]', { hasText: 'Autumn' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.locator('[data-testid=bookmark-done]').click();

  await page.getByRole('tab', { name: 'Bookmarks' }).click();
  await expect(listLink(page, 'Uncategorized').locator('ion-badge')).toHaveText('1');
  await expect(listLink(page, 'Autumn').locator('ion-badge')).toHaveText('1');
  await listLink(page, 'Uncategorized').click();
  await expect(page.locator('app-list app-target-list ion-item')).toContainText('Vega');
});

test('keeps the bookmarks of the old session plan', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('astrofinder.lists')) {
      localStorage.setItem('astrofinder.plan', JSON.stringify({ ids: ['M42'] }));
    }
  });
  await page.goto('/tabs/plan');
  await expect(listLink(page, 'Uncategorized').locator('ion-badge')).toHaveText('1');
});

test('imports a list file, and refuses one that is not a list', async ({ page }) => {
  await page.goto('/tabs/lists');
  const file = page.locator('[data-testid=import-file]');
  const list = { format: 'astrofinder-lists', version: 1, lists: [{ name: 'Shared', targets: ['M13', 'M57'] }] };
  await file.setInputFiles({
    name: 'shared.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(list)),
  });
  await expect(page.locator('[data-testid=lists-toast] .toast-message')).toHaveText('Imported 1 list');
  await expect(listLink(page, 'Shared').locator('ion-badge')).toHaveText('2');

  await file.setInputFiles({ name: 'photo.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
  await expect(page.locator('[data-testid=lists-toast] .toast-message').last()).toHaveText(
    "This isn't an AstroFinder list file",
  );
});

test('renames and deletes a list, but never renames or deletes Uncategorized', async ({ page }) => {
  await page.goto('/tabs/lists');
  await page.locator('[data-testid=new-list]').click();
  await page.locator('ion-alert input').fill('Doubles');
  await page.locator('ion-alert button', { hasText: 'Create' }).click();
  await expect(page.locator('[data-testid=list-title]')).toHaveText('Doubles');
  await expect(page.locator('[data-testid=list-empty]')).toContainText('This list is empty');

  await page.locator('[data-testid=list-actions]').click();
  await page.locator('ion-action-sheet button', { hasText: 'Rename' }).click();
  await page.locator('ion-alert input').fill('Double stars');
  await page.locator('ion-alert button', { hasText: 'Rename' }).click();
  await expect(page.locator('[data-testid=list-title]')).toHaveText('Double stars');

  // Wait for the first menu to close, so only the new one is on screen.
  await expect(page.locator('ion-action-sheet')).toHaveCount(0);
  await page.locator('[data-testid=list-actions]').click();
  await page.locator('ion-action-sheet button', { hasText: 'Delete list' }).click();
  await page.locator('ion-alert button', { hasText: 'Delete' }).click();
  await expect(listLink(page, 'Double stars')).toHaveCount(0);

  // Uncategorized offers neither rename nor delete.
  await listLink(page, 'Uncategorized').click();
  await page.locator('[data-testid=list-actions]').click();
  await expect(page.locator('ion-action-sheet button', { hasText: 'Save as a file' })).toBeVisible();
  await expect(page.locator('ion-action-sheet button', { hasText: 'Rename' })).toHaveCount(0);
  await expect(page.locator('ion-action-sheet button', { hasText: 'Delete list' })).toHaveCount(0);
});
