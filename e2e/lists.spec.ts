import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { openPage } from './navigation';

/** The row for a list on the Lists tab. */
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
  await expect(listLink(page, 'Saved for later')).toBeVisible();

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
  await expect(
    catalogues.locator('[data-testid=list-link]', { hasText: 'ASSA Top-100' }).locator('ion-badge'),
  ).toHaveText('100');
  // The lists whose publishers reserve all rights are hidden for now, and so are their credits.
  for (const name of ['Herschel', 'SAC 110', 'Explore the Universe', 'Urban']) {
    await expect(catalogues.locator('[data-testid=list-link]', { hasText: name })).toHaveCount(0);
  }
  for (const group of ['RASC Finest NGC', 'RASC Deep-Sky Gems']) {
    await expect(catalogues.locator('[data-testid=catalogue-group-link]', { hasText: group })).toHaveCount(0);
  }
  await page.goto('/tabs/lists');
  await expect(listLink(page, 'Saved for later')).toBeVisible();

  // Each split catalogue has its own page of lists.
  for (const [group, list, count] of [
    // The default location is on the equator, so the northern list: nine objects in November.
    ['Hubble Night Sky Challenge', 'November', '9'],
  ]) {
    await page.goto('/tabs/lists/catalogues');
    await page.locator('[data-testid=catalogue-group-link]', { hasText: group }).click();
    const lists = page.locator('app-catalogues', { has: page.locator('ion-title', { hasText: group }) });
    await expect(lists.locator('[data-testid=list-link]', { hasText: list }).locator('ion-badge')).toHaveText(count);
  }
  await page.goto('/tabs/lists');
  await expect(listLink(page, 'Saved for later')).toBeVisible();

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

  // A fifth of a degree from Vega, it is in the list, and first, as nothing else is that
  // close: its nearest neighbour, the faint star XY Lyr, is two thirds of a degree from it.
  await aimNear('Vega', 0.2);
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

test('asks for a name when making an editable copy of a catalogue', async ({ page }) => {
  await page.goto('/tabs/lists/messier');
  await page.locator('[data-testid=list-actions]').click();
  await page.locator('ion-action-sheet button', { hasText: 'Make an editable copy' }).click();

  // The name box offers the original's name, to keep or change.
  const name = page.locator('ion-alert [data-testid=copy-name]');
  await expect(name).toHaveValue('Messier');
  await name.fill('My Messier marathon');
  await page.locator('ion-alert button', { hasText: 'Copy' }).click();

  // The copy opens under its new name, with every object, and is listed as the user's own.
  // The page it came from may still be leaving, so look in the copy's own page.
  const copy = page.locator('app-list', { has: page.locator('ion-title', { hasText: 'My Messier marathon' }) });
  await expect(copy).toBeVisible();
  await expect(copy.locator('[data-testid=list-rows]')).toHaveAttribute('data-total', '110');
  await page.goto('/tabs/lists');
  await expect(listLink(page, 'My Messier marathon')).toBeVisible();
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

test('saves a bookmark to Saved for later, or to a new list', async ({ page }) => {
  await bookmarkFromTargets(page, 'Vega');
  await page.locator('ion-modal [data-testid=bookmark-list]', { hasText: 'Saved for later' }).click();
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

  await openPage(page, 'Lists');
  await expect(listLink(page, 'Saved for later').locator('ion-badge')).toHaveText('1');
  await expect(listLink(page, 'Autumn').locator('ion-badge')).toHaveText('1');
  await listLink(page, 'Saved for later').click();
  await expect(page.locator('app-list app-target-list ion-item')).toContainText('Vega');
});

test('keeps the bookmarks of the old session plan', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('astroturbomaxisolver.plan', JSON.stringify({ ids: ['M42'] })));
  await page.goto('/tabs/plan');
  await expect(listLink(page, 'Saved for later').locator('ion-badge')).toHaveText('1');
});

test('imports a list file, and refuses one that is not a list', async ({ page }) => {
  await page.goto('/tabs/lists');
  const file = page.locator('[data-testid=import-file]');
  const list = {
    format: 'astroturbomaxisolver-lists',
    version: 1,
    lists: [{ name: 'Shared', targets: ['M13', 'M57'] }],
  };
  await file.setInputFiles({
    name: 'shared.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(list)),
  });
  await expect(page.locator('[data-testid=lists-toast] .toast-message')).toHaveText('Imported 1 list');
  await expect(listLink(page, 'Shared').locator('ion-badge')).toHaveText('2');

  await file.setInputFiles({ name: 'photo.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
  await expect(page.locator('[data-testid=lists-toast] .toast-message').last()).toHaveText(
    "This isn't an AstroTurboMaxiSolver list file",
  );
});

test('renames and deletes a list, but never renames or deletes Saved for later', async ({ page }) => {
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

  // Saved for later offers neither rename nor delete.
  await listLink(page, 'Saved for later').click();
  await page.locator('[data-testid=list-actions]').click();
  await expect(page.locator('ion-action-sheet button', { hasText: 'Save as a file' })).toBeVisible();
  await expect(page.locator('ion-action-sheet button', { hasText: 'Rename' })).toHaveCount(0);
  await expect(page.locator('ion-action-sheet button', { hasText: 'Delete list' })).toHaveCount(0);
});

/** Chooses an order from the list's sort menu. */
async function chooseOrder(page: Page, name: string): Promise<void> {
  await page.locator('app-list [data-testid=list-sort]').click();
  await page.locator('ion-action-sheet button', { hasText: name }).click();
  await expect(page.locator('ion-action-sheet')).toHaveCount(0, { timeout: 15_000 });
}

test('orders and filters a catalogue like any list, and remembers the order', async ({ page }) => {
  await page.goto('/tabs/lists/messier');
  // The search is ready to type in as the list opens.
  await expect(page.locator('app-list [data-testid=list-search] input')).toBeFocused();
  const rows = page.locator('app-list [data-testid=list-rows]');
  const items = page.locator('app-list app-target-list ion-item');
  await expect(rows).toHaveAttribute('data-sort', 'list');
  await expect(items.first().locator('[data-testid=designations]')).toContainText('M1');
  await expect(page.locator('[data-testid=list-section]')).toHaveCount(0);

  // By height, the rows go under headings that match what each row shows.
  await chooseOrder(page, 'Highest now');
  await expect(rows).toHaveAttribute('data-sort', 'highest');
  await expect(page.locator('[data-testid=list-section]').first()).toHaveText(/Up now|Rises later/);

  // By best time, each row says when that is.
  await chooseOrder(page, 'Best time tonight');
  await expect(page.locator('[data-testid=list-section]').first()).toHaveText('Tonight');
  await expect(items.first().locator('[data-testid=row-note]')).toContainText(/best \d+:\d\d/);

  // The filter sheet is the Targets tab's, here too. Closed, a filter in use stays on show as a chip.
  await page.locator('app-list [data-testid=list-filter]').click();
  await page.locator('[data-testid=list-type-filters] ion-chip', { hasText: 'Galaxy' }).click();
  await expect(rows).toHaveAttribute('data-total', '40');
  await page.locator('[data-testid=filters-close]').click();
  await expect(page.locator('[data-testid=list-filters]')).toHaveCount(0);
  const active = page.locator('app-list [data-testid=list-active-filters] ion-chip');
  await expect(active).toHaveText(/Galaxy/);
  await active.click();
  await expect(rows).toHaveAttribute('data-total', '110');

  // The chart of tonight starts closed, opens on any list, and stays as it was left.
  await expect(page.locator('app-list [data-testid=plan-chart]')).toHaveCount(0);
  await page.locator('app-list [data-testid=list-chart-toggle]').click();
  await expect(page.locator('app-list [data-testid=plan-line]')).toHaveCount(8);

  // The order chosen for this list is kept, and the chart is open again.
  await page.reload();
  await expect(page.locator('app-list [data-testid=list-rows]')).toHaveAttribute('data-sort', 'best-time');
  await expect(page.locator('app-list [data-testid=plan-chart]')).toBeVisible();
});

test('removes a row from an own list by its swipe action, with undo, and reorders the list', async ({ page }) => {
  await page.goto('/tabs/lists');
  const list = {
    format: 'astroturbomaxisolver-lists',
    version: 1,
    lists: [{ name: 'Night', targets: ['M13', 'M57', 'M31'] }],
  };
  await page.locator('[data-testid=import-file]').setInputFiles({
    name: 'night.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(list)),
  });
  await listLink(page, 'Night').click();
  const names = page.locator('app-list [data-testid=designations]');
  await expect(names).toHaveText([/^M13/, /^M57/, /^M31/]);
  // The chart starts closed here too, until opened on some list.
  await expect(page.locator('app-list [data-testid=plan-chart]')).toHaveCount(0);

  // Swiping is slow to drive, so the row's actions are opened directly.
  const openActions = (index: number) =>
    page
      .locator('app-list ion-item-sliding')
      .nth(index)
      .evaluate((row) => (row as unknown as { open: (side: string) => Promise<void> }).open('end'));
  await openActions(1);
  await page.locator('app-list ion-item-sliding').nth(1).locator('[data-testid=swipe-remove]').click();
  await expect(names).toHaveText([/^M13/, /^M31/]);
  // Undo puts it back where it was.
  await page.locator('[data-testid=removed-toast]').getByRole('button', { name: 'Undo' }).click();
  await expect(names).toHaveText([/^M13/, /^M57/, /^M31/]);

  // The other action marks the target seen, as the sky map's eye does.
  await openActions(0);
  await page.locator('app-list ion-item-sliding').nth(0).locator('[data-testid=swipe-seen]').click();
  await expect(page.locator('[data-testid=seen-toast]')).toContainText('Seen · first time');
  await expect(page.locator('[data-testid=list-seen-count]')).toHaveText('1 of 3 seen');

  // Reordering gives each row a handle. Dragging is slow to drive, so the drop is sent directly.
  await page.locator('[data-testid=list-actions]').click();
  await page.locator('ion-action-sheet button', { hasText: 'Reorder' }).click();
  await expect(page.locator('app-list [data-testid=reorder-handle]')).toHaveCount(3);
  await page
    .locator('app-list ion-reorder-group')
    .evaluate((group) =>
      group.dispatchEvent(new CustomEvent('ionReorderEnd', { detail: { from: 2, to: 0, complete: () => undefined } })),
    );
  await expect(names).toHaveText([/^M31/, /^M13/, /^M57/]);
  await page.locator('[data-testid=reorder-done]').click();
  await expect(page.locator('app-list [data-testid=reorder-handle]')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('app-list [data-testid=designations]')).toHaveText([/^M31/, /^M13/, /^M57/]);
});

test('shares a list through the share sheet as a text file, and never downloads it', async ({ page }) => {
  // A stand-in share sheet that records what it is given, and refuses JSON files as real ones do.
  await page.addInitScript(() => {
    const shared: { name: string; type: string }[] = [];
    Object.assign(window, { sharedFiles: shared });
    Object.assign(navigator, {
      canShare: (data: { files?: File[] }) => !!data.files?.every((file) => file.type === 'text/plain'),
      share: (data: { files?: File[] }) => {
        shared.push(...(data.files ?? []).map(({ name, type }) => ({ name, type })));
        return Promise.resolve();
      },
    });
  });
  let downloads = 0;
  page.on('download', () => downloads++);

  await page.goto('/tabs/lists/messier');
  await page.locator('[data-testid=share-list]').click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { sharedFiles: unknown[] }).sharedFiles))
    .toEqual([{ name: 'astroturbomaxisolver-messier.txt', type: 'text/plain' }]);
  expect(downloads).toBe(0);
});

test('plays a list on the sky map: next and previous, skipping what is below the horizon', async ({ page }) => {
  // Near the pole, M81 and M97 never set and M42 never rises, whatever the time of the test.
  // Not at 85° north: there M42 passes 0.4° under the horizon, and refraction lifts it over.
  await page.addInitScript(() =>
    localStorage.setItem(
      'astroturbomaxisolver.settings',
      JSON.stringify({ latitudeDeg: 89, longitudeDeg: 0, locationSet: true }),
    ),
  );
  await page.goto('/tabs/lists');
  await page.getByTestId('import-file').setInputFiles({
    name: 'circumpolar.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'astroturbomaxisolver-lists',
        version: 1,
        lists: [{ name: 'Circumpolar', targets: ['M81', 'M42', 'M97'] }],
      }),
    ),
  });
  await listLink(page, 'Circumpolar').click();

  // A tap on a row opens the map, playing the list from that row.
  await page.locator('app-list ion-item', { hasText: 'M81' }).first().click();
  await expect(page).toHaveURL(/tabs\/sky/);
  const playlist = page.getByTestId('playlist');
  await expect(playlist.getByTestId('playlist-position')).toHaveText('1/3');
  await expect(playlist).toContainText('Circumpolar');
  await expect(page.getByRole('button', { name: 'Previous target' })).toBeDisabled();

  // Next skips M42, which is below the horizon, and stops at the end of the list.
  await page.getByTestId('playlist-next').click();
  await expect(page.getByTestId('target-designations')).toContainText('M97');
  await expect(playlist.getByTestId('playlist-position')).toHaveText('3/3');
  await expect(page.getByRole('button', { name: 'Next target' })).toBeDisabled();

  await page.getByTestId('playlist-previous').click();
  await expect(page.getByTestId('target-designations')).toContainText('M81');

  // The list's name opens the list again, and the map's Lists button goes back there.
  await page.getByTestId('playlist-name').click();
  await expect(page.locator('app-list [data-testid=list-title]')).toHaveText('Circumpolar');
  await page.locator('app-list ion-back-button').click();
  await page.getByTestId('back-to-map').click();
  await expect(playlist).toBeVisible();

  // Clearing the target stops playing the list.
  await page.getByRole('button', { name: 'Clear target' }).click();
  await expect(page.getByTestId('target-bar')).toHaveCount(0);
});

test("shows an observing programme's card on its lists, open until read", async ({ page }) => {
  await page.goto('/tabs/lists/assa100');
  const card = page.locator('app-list app-program-card');
  // Open the first time: who runs it, what for, and a link to its own page in a new tab.
  await expect(card.getByTestId('program-name')).toHaveText('Top-100 Deep-Sky Objects');
  const link = card.getByTestId('program-link');
  await expect(link).toHaveAttribute('href', /^https:\/\/assa\.saao\.ac\.za\//);
  await expect(link).toHaveAttribute('target', '_blank');
  // Folded, it stays folded, even after a reload.
  await card.getByTestId('program-card-toggle').click();
  await expect(card.getByTestId('program-card')).toHaveCount(0);
  await page.reload();
  await expect(card.getByTestId('program-name')).toHaveText('Top-100 Deep-Sky Objects');
  await expect(card.getByTestId('program-card')).toHaveCount(0);

  // The months of a split catalogue share their programme's card, which the group page has too.
  await page.goto('/tabs/lists/catalogues/hubble');
  await expect(page.locator('app-catalogues app-program-card').getByTestId('program-card')).toBeVisible();
  // Catalogues that aren't programmes have none.
  await page.goto('/tabs/lists/messier');
  await expect(page.locator('app-list app-program-card')).toHaveCount(0);
});

test('imports observing lists from SkySafari and from CSV files, saying what it left out', async ({ page }) => {
  await page.goto('/tabs/lists');
  const skylist = [
    'SkySafariObservingListVersion=3.0',
    'SkyObject=BeginObject',
    '\tCommonName=Andromeda Galaxy',
    '\tCatalogNumber=M 31',
    '\tCatalogNumber=NGC 224',
    'EndObject=SkyObject',
    'SkyObject=BeginObject',
    '\tCatalogNumber=LBN 487',
    '\tCatalogNumber=NGC 7023',
    'EndObject=SkyObject',
    'SkyObject=BeginObject',
    '\tCatalogNumber=PGC 99999999',
    'EndObject=SkyObject',
  ].join('\n');
  await page.locator('[data-testid=import-file]').setInputFiles({
    name: 'Autumn favourites.skylist',
    mimeType: 'text/plain',
    buffer: Buffer.from(skylist),
  });
  // The list is named after the file, and the one object the app doesn't know is named.
  await expect(page.getByTestId('lists-toast')).toContainText('Imported 1 list. 1 not found: PGC 99999999');
  await listLink(page, 'Autumn favourites').click();
  const names = page.locator('app-list [data-testid=designations]');
  await expect(names).toHaveText([/^M31/, /NGC 7023/]);

  // A spreadsheet's CSV, with a header and other columns, imports the same way.
  await page.locator('app-list ion-back-button').click();
  await page.locator('[data-testid=import-file]').setInputFiles({
    name: 'Doubles.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Object,Magnitude\nAlbireo,3.1\n"Messier 13",5.8\n'),
  });
  await expect(page.getByTestId('lists-toast').last()).toContainText('Imported 1 list');
  await listLink(page, 'Doubles').click();
  await expect(names).toHaveText([/Albireo/, /^M13/]);
});
