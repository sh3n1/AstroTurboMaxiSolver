import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

/** A log entry for M31 as a backup file holds it. */
function backupEntry(id: string, time: string, rating: number): object {
  const equipment = {
    telescopeType: 'newtonian',
    telescopeFocalMm: 650,
    telescopeApertureMm: 130,
    eyepieceFocalMm: 25,
    eyepieceFieldDeg: 52,
  };
  return {
    id,
    targetId: 'M31',
    targetName: 'Andromeda Galaxy',
    time,
    rating,
    tags: [],
    note: '',
    conditions: {
      latitudeDeg: 39.47,
      longitudeDeg: -0.376,
      altDeg: 50,
      bortle: 8,
      moonLitPercent: 0,
      moonAltDeg: -10,
      equipment,
    },
  };
}

/** Selects a target from the Targets tab, which opens the sky map with it. */
async function selectTarget(page: Page, search: string): Promise<void> {
  await page.goto('/tabs/targets');
  await page.locator('app-targets ion-searchbar input').fill(search);
  // Wait for the search to apply, because the list updates just after typing.
  await expect(page.locator('app-targets ion-item').first()).toContainText(search);
  await page.locator('app-targets ion-item').first().click();
  await expect(page.locator('[data-testid=target-bar]')).toContainText(search);
}

test('logs a target as seen, with a note, and shows it in the log and the catalogue', async ({ page }) => {
  await selectTarget(page, 'M31');
  const seen = page.locator('[data-testid=mark-seen]');
  await expect(seen.locator('ion-icon')).toHaveAttribute('name', 'eye-outline');
  await expect(page.getByTestId('mark-seen-wrap').getByTestId('seen-count')).toHaveCount(0);

  // With no observation yet, the eye opens a blank form, which logs nothing until used.
  await seen.click();
  const sheet = page.locator('ion-modal app-log-entry-sheet');
  await expect(sheet.locator('[data-testid=log-conditions]')).toContainText('Bortle 5');
  await expect(sheet.getByTestId('log-delete')).toHaveCount(0);
  await sheet.locator('[data-testid=log-sheet-close]').click();
  await expect(sheet).toHaveCount(0);
  await expect(seen.locator('ion-icon')).toHaveAttribute('name', 'eye-outline');

  // Choosing how well it was seen logs it, and the eye fills in.
  await seen.click();
  await sheet.locator('[data-testid=log-rating] ion-chip', { hasText: 'Great' }).click();
  await expect(seen.locator('ion-icon')).toHaveAttribute('name', 'eye');
  await expect(sheet.getByTestId('log-position')).toHaveText('1 of 1');
  await sheet.locator('[data-testid=log-tag]', { hasText: 'Detail' }).click();
  await sheet.locator('[data-testid=log-note] textarea').first().fill('Dust lane, M32 and M110');
  // The note saves a moment after typing stops.
  await page.waitForTimeout(500);
  await sheet.locator('[data-testid=log-sheet-close]').click();
  await expect(sheet).toHaveCount(0);

  // The log has it, under tonight, with the note.
  await page.goto('/tabs/lists');
  await expect(page.locator('[data-testid=log-link] ion-badge')).toHaveText('1');
  await page.locator('[data-testid=log-link]').click();
  await expect(page.locator('[data-testid=log-totals]')).toContainText('1 object seen');
  const entry = page.locator('[data-testid=log-entry]');
  await expect(entry).toHaveCount(1);
  await expect(entry).toContainText('Detail');
  await expect(entry).toContainText('Dust lane, M32 and M110');
  await expect(entry.locator('ion-badge')).toHaveText('Great');

  // Messier shows one seen, with a tick on M31 and a filter for what is left.
  await page.goto('/tabs/lists/messier');
  await expect(page.locator('[data-testid=list-seen-count]')).toHaveText('1 of 110 seen');
  const rows = page.locator('app-list app-target-list ion-item');
  // M31 is further down than the first rows a list shows, so scroll for more.
  await rows.last().scrollIntoViewIfNeeded();
  await expect(rows.filter({ hasText: 'M31' }).locator('[data-seen=seen]')).toHaveCount(1);
  await page.locator('app-list [data-testid=list-filter]').click();
  const filters = page.locator('[data-testid=list-seen-filters] ion-chip');
  await filters.filter({ hasText: 'Seen' }).click();
  await expect(rows).toHaveCount(1);
  await filters.filter({ hasText: 'To see' }).click();
  await expect(page.locator('app-list [data-testid=list-rows]')).toHaveAttribute('data-total', '109');
  await page.locator('[data-testid=filters-close]').click();

  // The Catalogues page shows the progress on Messier's badge.
  await page.goto('/tabs/lists/catalogues');
  await expect(page.locator('[data-testid=list-link]', { hasText: 'Messier' }).locator('ion-badge')).toHaveText(
    '1/110',
  );
});

test('pages through observations, adds one, and deletes one with undo', async ({ page }) => {
  await selectTarget(page, 'M42');
  const eye = page.getByTestId('mark-seen');
  const sheet = page.locator('ion-modal app-log-entry-sheet');
  const position = sheet.getByTestId('log-position');

  // A first observation, then a second one from New.
  await eye.click();
  await sheet.locator('[data-testid=log-tag]', { hasText: 'Detail' }).click();
  await expect(position).toHaveText('1 of 1');
  await sheet.getByTestId('log-add').click();
  await expect(position).toHaveText('New');
  await sheet.locator('[data-testid=log-tag]', { hasText: 'Colour' }).click();
  await expect(position).toHaveText('2 of 2');

  // Reopened, it shows the newest, and pages back to the older one.
  await sheet.getByTestId('log-sheet-close').click();
  await eye.click();
  await expect(position).toHaveText('2 of 2');
  await expect(sheet.locator('[data-testid=log-tag][aria-checked=true]')).toHaveText('Colour');
  await sheet.getByTestId('log-older').click();
  await expect(position).toHaveText('1 of 2');
  await expect(sheet.locator('[data-testid=log-tag][aria-checked=true]')).toHaveText('Detail');

  // Delete is in the header. It shows the next entry, and Undo brings it back.
  await sheet.getByTestId('log-delete').click();
  await expect(position).toHaveText('1 of 1');
  await page.getByTestId('log-deleted-toast').getByRole('button', { name: 'Undo' }).click();
  await expect(position).toHaveText('1 of 2');

  // Deleting both leaves a blank form, and the eye empty again.
  await sheet.getByTestId('log-delete').click();
  await sheet.getByTestId('log-delete').click();
  await expect(sheet.getByTestId('log-delete')).toHaveCount(0);
  await sheet.getByTestId('log-sheet-close').click();
  await expect(eye.locator('ion-icon')).toHaveAttribute('name', 'eye-outline');
  await page.goto('/tabs/lists/log');
  await expect(page.locator('[data-testid=log-empty]')).toBeVisible();
});

test('shows all-time observation counts on the sky and lists, excluding failed tries', async ({ page }) => {
  await selectTarget(page, 'M31');
  await page.getByTestId('mark-seen').click();
  await page.locator('[data-testid=log-rating] ion-chip', { hasText: 'Good' }).click();
  await page.getByTestId('log-sheet-close').click();
  await expect(page.getByTestId('mark-seen').locator('ion-icon')).toHaveAttribute('name', 'eye');
  // Two earlier tries come from a backup: one seen, one not. The page then reloads, so the
  // counts also show that the log is kept on the device.
  await page.goto('/tabs/lists/log');
  await page.getByTestId('log-import-file').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'astrofinder-log',
        version: 1,
        entries: [
          backupEntry('previous-observation', '2020-01-01T22:00:00.000Z', 3),
          backupEntry('failed-observation', '2020-01-02T22:00:00.000Z', 0),
        ],
      }),
    ),
  });
  await expect(page.getByTestId('log-toast')).toContainText('Imported 2 entries');
  await selectTarget(page, 'M31');
  await expect(page.getByTestId('mark-seen-wrap').getByTestId('seen-count')).toHaveText('2');
  await expect(page.getByTestId('mark-seen').getByRole('button')).toHaveAccessibleName('Observations, seen 2 times');

  await page.goto('/tabs/targets');
  await page.locator('app-targets ion-searchbar input').fill('M31');
  const targetRow = page.locator('app-targets ion-item').filter({ hasText: 'M31' }).first();
  await expect(targetRow.getByTestId('seen-count')).toHaveText('2');
  await expect(targetRow.locator('[data-seen=seen]')).toHaveAccessibleName('Seen 2 times');
  await expect(targetRow.locator('ion-icon[name=checkmark-circle]')).toHaveCount(0);

  await targetRow.click();
  await page.getByTestId('mark-seen').click();
  const entryModal = page.locator('ion-modal').filter({ has: page.locator('app-log-entry-sheet') });
  await expect(entryModal).toBeVisible();
  // It opens on the newest of the three. Deleting it leaves the older two, one of them failed.
  await expect(page.getByTestId('log-position')).toHaveText('3 of 3');
  await page.getByTestId('log-delete').click();
  await expect(page.getByTestId('log-position')).toHaveText('2 of 2');
  await page.getByTestId('log-sheet-close').click();
  await expect(page.getByTestId('mark-seen-wrap').getByTestId('seen-count')).toHaveCount(0);
  // The older observations remain, so the eye stays filled in, with no count for one sighting.
  await expect(page.getByTestId('mark-seen').locator('ion-icon')).toHaveAttribute('name', 'eye');
  await page.getByRole('tab', { name: 'Targets', exact: true }).click();
  await expect(targetRow.getByTestId('seen-count')).toHaveCount(0);
  await expect(targetRow.locator('ion-icon[name=checkmark-circle]')).toHaveCount(1);
});

test('moves the log and lists saved before the database into it, once', async ({ page }) => {
  // What an earlier version of the app left in localStorage.
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const entry = {
      id: 'old-entry',
      targetId: 'M42',
      targetName: 'Orion Nebula',
      time: '2025-12-01T22:00:00.000Z',
      rating: 4,
      tags: ['Detail'],
      note: 'Trapezium sharp',
      conditions: {
        latitudeDeg: 39.47,
        longitudeDeg: -0.376,
        altDeg: 40,
        bortle: 8,
        moonLitPercent: 0,
        moonAltDeg: -10,
        equipment: {
          telescopeType: 'newtonian',
          telescopeFocalMm: 650,
          telescopeApertureMm: 130,
          eyepieceFocalMm: 25,
          eyepieceFieldDeg: 52,
        },
      },
    };
    localStorage.setItem('astrofinder.log', JSON.stringify([entry]));
    localStorage.setItem(
      'astrofinder.lists',
      JSON.stringify([
        { id: 'uncategorized', name: 'Uncategorized', targetIds: ['M13'] },
        { id: 'list-old', name: 'Winter', targetIds: ['M42', 'M45'] },
      ]),
    );
  });
  await page.goto('/tabs/lists/log');
  await expect(page.locator('app-log')).toContainText('Trapezium sharp');
  // The old copies are gone once the database has them.
  expect(
    await page.evaluate(() => [localStorage.getItem('astrofinder.log'), localStorage.getItem('astrofinder.lists')]),
  ).toEqual([null, null]);

  await page.reload();
  await expect(page.locator('app-log')).toContainText('Trapezium sharp');
  // M42, seen in the old log, counts in the old list.
  await page.goto('/tabs/lists');
  await expect(page.locator('[data-testid=list-link]', { hasText: 'Winter' }).locator('ion-badge')).toHaveText('1/2');
  await expect(page.locator('[data-testid=list-link]', { hasText: 'Saved for later' }).locator('ion-badge')).toHaveText(
    '1',
  );
});

test('gives UUIDs to the records of a database saved with older ids', async ({ page }) => {
  // A database as the first version made it, built on a plain page of the app's address.
  await page.goto('/manifest.webmanifest');
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        // Dexie keeps its version 1 as IndexedDB version 10.
        const request = indexedDB.open('astrofinder', 10);
        request.onupgradeneeded = () => {
          const db = request.result;
          db.createObjectStore('meta', { keyPath: 'key' });
          const indexes: Record<string, string[]> = {
            logEntries: ['targetId', 'time', 'updatedAt', 'pending'],
            lists: ['updatedAt', 'pending'],
            listItems: ['listId', 'targetId', 'updatedAt', 'pending'],
          };
          for (const [name, fields] of Object.entries(indexes)) {
            const store = db.createObjectStore(name, { keyPath: 'id' });
            for (const field of fields) store.createIndex(field, field);
          }
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const meta = {
            createdAt: 1,
            updatedAt: 1,
            deviceId: 'device-1',
            rev: 1,
            hash: 'x',
            deletedAt: null,
            pending: 1,
          };
          const tx = db.transaction(['meta', 'logEntries', 'lists', 'listItems'], 'readwrite');
          tx.objectStore('meta').put({ key: 'deviceId', value: 'device-1' });
          tx.objectStore('meta').put({ key: 'migratedFromLocalStorage', value: 1 });
          tx.objectStore('logEntries').put({
            ...meta,
            id: 'mfx1-abc123',
            targetId: 'M42',
            targetName: 'Orion Nebula',
            time: '2025-12-01T22:00:00.000Z',
            rating: 4,
            tags: [],
            note: 'From version 1',
            conditions: {
              latitudeDeg: 39.47,
              longitudeDeg: -0.376,
              altDeg: 40,
              bortle: 8,
              moonLitPercent: 0,
              moonAltDeg: -10,
              equipment: {
                telescopeType: 'newtonian',
                telescopeFocalMm: 650,
                telescopeApertureMm: 130,
                eyepieceFocalMm: 25,
                eyepieceFieldDeg: 52,
              },
            },
          });
          tx.objectStore('lists').put({ ...meta, id: 'uncategorized', name: 'Saved for later' });
          tx.objectStore('lists').put({ ...meta, id: 'list-old', name: 'Winter', createdAt: 2 });
          tx.objectStore('listItems').put({
            ...meta,
            id: 'list-old|M42',
            listId: 'list-old',
            targetId: 'M42',
            position: 0,
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
        };
      }),
  );

  await page.goto('/tabs/lists');
  await expect(page.locator('[data-testid=list-link]', { hasText: 'Winter' }).locator('ion-badge')).toHaveText('1/1');
  await page.goto('/tabs/lists/log');
  await expect(page.locator('app-log')).toContainText('From version 1');

  // Every id is now a UUID.
  const ids = await page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const request = indexedDB.open('astrofinder');
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(['logEntries', 'lists', 'listItems'], 'readonly');
          const all: string[] = [];
          for (const name of ['logEntries', 'lists', 'listItems']) {
            tx.objectStore(name).getAllKeys().onsuccess = (event) =>
              all.push(...((event.target as IDBRequest<IDBValidKey[]>).result as string[]));
          }
          tx.oncomplete = () => {
            db.close();
            resolve(all);
          };
        };
      }),
  );
  expect(ids).toHaveLength(4);
  for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});
