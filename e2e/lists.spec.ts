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

test('shows the Tonight, Messier and Caldwell collections', async ({ page }) => {
  await page.goto('/tabs/lists');
  await expect(listLink(page, 'Tonight')).toBeVisible();
  await expect(listLink(page, 'Messier catalogue').locator('ion-badge')).toHaveText('110');
  // 109 Caldwell numbers, but C14, the Double Cluster, is two objects.
  await expect(listLink(page, 'Caldwell catalogue').locator('ion-badge')).toHaveText('110');
  await expect(listLink(page, 'Uncategorized')).toBeVisible();

  // Tonight explains the conditions its recommendations are for.
  await listLink(page, 'Tonight').click();
  await expect(page.locator('[data-testid=conditions]')).toContainText('Darkness');
  await expect(page.locator('[data-testid=conditions]')).toContainText('% lit');
});

test('lists a catalogue in order, and searches inside it', async ({ page }) => {
  await page.goto('/tabs/lists');
  await listLink(page, 'Caldwell catalogue').click();
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
