import { devices, expect, test } from '@playwright/test';

const SETTINGS_KEY = 'astroturbomaxisolver.settings';

test('saves a full backup, and restores it on another phone with its lists and settings', async ({
  browser,
  baseURL,
}, testInfo) => {
  const options = { ...devices['Pixel 7'], baseURL, storageState: 'e2e/storage-state.json' };

  // One phone: a list of its own, and large text.
  const phone = await (await browser.newContext(options)).newPage();
  await phone.goto('/tabs/lists');
  await phone.getByTestId('new-list').click();
  await phone.locator('ion-alert input').fill('Winter doubles');
  await phone.locator('ion-alert button', { hasText: 'Create' }).click();
  await expect(phone.getByTestId('list-title')).toHaveText('Winter doubles');
  await phone.goto('/tabs/settings');
  await phone.locator('[data-testid=text-size] ion-segment-button[value=large]').click();

  // Its backup: one zip file, named by the date.
  const saving = phone.waitForEvent('download');
  await phone.getByTestId('backup-save').click();
  const download = await saving;
  expect(download.suggestedFilename()).toMatch(/^astroturbomaxisolver-backup-\d{4}-\d{2}-\d{2}\.zip$/);
  const file = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(file);

  // Another phone, with nothing of its own: restoring says what the backup holds first.
  const other = await (await browser.newContext(options)).newPage();
  await other.goto('/tabs/settings');
  await other.getByTestId('backup-file').setInputFiles(file);
  const confirm = other.getByTestId('backup-confirm');
  await expect(confirm).toContainText('lists: 2');
  await confirm.locator('button', { hasText: 'Restore' }).click();
  await expect(other.getByTestId('backup-toast')).toContainText('Backup restored');

  // After the reload, the list and the settings are there.
  await other.waitForLoadState('load');
  await expect
    .poll(() => other.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').textSize, SETTINGS_KEY))
    .toBe('large');
  await other.goto('/tabs/lists');
  await expect(other.getByText('Winter doubles')).toBeVisible();

  // Something that isn't a backup is refused, and changes nothing.
  await other.goto('/tabs/settings');
  await other
    .getByTestId('backup-file')
    .setInputFiles({ name: 'notes.zip', mimeType: 'application/zip', buffer: Buffer.from('nope') });
  await expect(other.getByTestId('backup-toast')).toContainText('isn’t an AstroTurboMaxiSolver backup');
});
