import type { Page } from '@playwright/test';
import { devices, expect, test } from '@playwright/test';

import { openPage } from './navigation';

// Link sync: two phones linked in Two phones sync their lists straight over the link, only
// once both have "Sync with the linked phone" on. Two phones are two browsers here, linked by
// real WebRTC on this machine, with the codes pasted rather than scanned.

/** The code a phone shows as a QR code. */
async function shownCode(page: Page): Promise<string> {
  const canvas = page.locator('[data-testid=remote-code] canvas');
  await expect(canvas).toHaveAttribute('data-code', /^AF1:/, { timeout: 15_000 });
  return (await canvas.getAttribute('data-code'))!;
}

async function paste(page: Page, code: string): Promise<void> {
  await page.locator('[data-testid=remote-paste] textarea').fill(code);
  await page.getByTestId('remote-paste-submit').click();
}

/** Makes a list, from Lists. */
async function makeList(page: Page, name: string): Promise<void> {
  await page.goto('/tabs/lists');
  await page.getByTestId('new-list').click();
  await page.locator('ion-alert input').fill(name);
  await page.locator('ion-alert button', { hasText: 'Create' }).click();
  await expect(page.getByTestId('list-title')).toHaveText(name);
}

/** The names of the lists saved on a phone, read from its database. */
function savedLists(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open('astroturbomaxisolver');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const read = open.result.transaction('lists').objectStore('lists').getAll();
          read.onsuccess = () =>
            resolve((read.result as { name: string; deletedAt: number | null }[]).map((l) => l.name));
        };
      }),
  );
}

test('syncs lists over the link only once both phones have it on', async ({ page: finder, browser }, testInfo) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({
    ...devices['Pixel 7'],
    baseURL: String(testInfo.project.use.baseURL),
    storageState: 'e2e/storage-state.json',
  });
  const screen = await context.newPage();
  // Automatic solving would use the fake camera. The finder has link sync on from the start.
  await finder.addInitScript(() =>
    localStorage.setItem('astroturbomaxisolver.settings', JSON.stringify({ autoSolve: false, linkSync: true })),
  );
  await screen.addInitScript(() =>
    localStorage.setItem('astroturbomaxisolver.settings', JSON.stringify({ autoSolve: false })),
  );

  // Each phone has a list of its own before they link.
  await makeList(finder, 'Galaxies');
  await makeList(screen, 'Doubles');

  // They link: the finder shows its code, the screen pastes it and replies, the finder pastes that.
  await finder.goto('/remote');
  await finder.getByTestId('remote-as-finder').click();
  const offer = await shownCode(finder);
  await screen.goto('/remote');
  await screen.getByTestId('remote-as-screen').click();
  await paste(screen, offer);
  await paste(finder, await shownCode(screen));
  await expect(screen).toHaveURL(/tabs\/sky/, { timeout: 20_000 });

  // Only the finder has it on: nothing goes either way.
  await finder.waitForTimeout(1500);
  expect(await savedLists(finder)).not.toContain('Doubles');

  // The screen turns it on in Settings, where sync shows after five taps on the title.
  await openPage(screen, 'Settings');
  const title = screen.getByTestId('settings-title').filter({ visible: true });
  for (let tap = 0; tap < 5; tap++) await title.click();
  await screen.getByTestId('link-sync').click();
  await expect(screen.getByTestId('link-sync-active')).toBeVisible();

  // Each phone gets the other's list.
  await expect.poll(() => savedLists(finder)).toContain('Doubles');
  await expect.poll(() => savedLists(screen)).toContain('Galaxies');

  // And a change made now goes across as it happens.
  await openPage(screen, 'Lists');
  await screen.getByTestId('new-list').click();
  await screen.locator('ion-alert input').fill('Nebulae');
  await screen.locator('ion-alert button', { hasText: 'Create' }).click();
  await expect.poll(() => savedLists(finder)).toContain('Nebulae');
  await context.close();
});
