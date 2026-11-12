import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

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

  // One tap logs it, and the eye fills in.
  await seen.click();
  await expect(page.locator('[data-testid=seen-toast]')).toContainText('Seen · first time');
  await expect(seen.locator('ion-icon')).toHaveAttribute('name', 'eye');

  // Tapping again opens the note instead of logging it twice.
  await seen.click();
  const sheet = page.locator('ion-modal app-log-entry-sheet');
  await expect(sheet.locator('[data-testid=log-conditions]')).toContainText('Bortle 5');
  await sheet.locator('[data-testid=log-rating] ion-chip', { hasText: 'Great' }).click();
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

test('undoes a sighting from the toast', async ({ page }) => {
  await selectTarget(page, 'M42');
  await page.locator('[data-testid=mark-seen]').click();
  await page.locator('[data-testid=seen-toast]').getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('[data-testid=mark-seen] ion-icon')).toHaveAttribute('name', 'eye-outline');
  await page.goto('/tabs/lists/log');
  await expect(page.locator('[data-testid=log-empty]')).toBeVisible();
});
