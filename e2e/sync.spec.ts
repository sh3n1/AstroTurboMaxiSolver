import type { BrowserContext, Page, Route } from '@playwright/test';
import { devices, expect, test } from '@playwright/test';

// Sync between two devices through Google Drive. Two devices are two browser contexts, each
// with its own database. Google is never called: its sign-in script is replaced by one that
// hands out a token at once, and Drive's app folder is kept here, in memory, shared by both,
// answering the same requests the real one would. So the app's real code runs end to end.

/** Stands in for Google's sign-in script: a token at once, as for a user who already agreed. */
const FAKE_GOOGLE_SCRIPT = `
  window.google = { accounts: { oauth2: {
    initTokenClient: (config) => ({
      requestAccessToken: () => setTimeout(() => config.callback({ access_token: 'test-token', expires_in: 3600 })),
    }),
    revoke: () => {},
  } } };
`;

/** Drive's hidden app folder, shared by every device in a test. */
class FakeDrive {
  readonly files: { id: string; name: string; text: string }[] = [];
  private nextId = 1;

  /** Answers one request to Drive's API, as Drive would. */
  async handle(route: Route): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (method === 'GET' && url.pathname === '/drive/v3/files') {
      await route.fulfill({ json: { files: this.files.map(({ id, name }) => ({ id, name })) } });
      return;
    }
    const id = url.pathname.split('/').pop()!;
    const file = this.files.find((f) => f.id === id);
    if (method === 'GET') {
      await route.fulfill(file ? { body: file.text } : { status: 404 });
    } else if (method === 'PATCH') {
      file!.text = request.postData() ?? '';
      await route.fulfill({ json: { id } });
    } else if (method === 'DELETE') {
      if (file) this.files.splice(this.files.indexOf(file), 1);
      await route.fulfill(file ? { status: 204 } : { status: 404 });
    } else {
      // A new file: its name in the first part, its content in the second.
      const parts = (request.postData() ?? '').split(/--astroturbomaxisolver-\w+/);
      const metadata = JSON.parse(parts[1].split('\r\n\r\n')[1]) as { name: string };
      const created = {
        id: `file-${this.nextId++}`,
        name: metadata.name,
        text: parts[2].split('\r\n\r\n')[1].trimEnd(),
      };
      this.files.push(created);
      await route.fulfill({ json: { id: created.id } });
    }
  }
}

/** A device: a fresh browser context, with Google faked and the shared drive. */
async function device(context: BrowserContext, drive: FakeDrive): Promise<Page> {
  await context.route('https://accounts.google.com/gsi/client', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: FAKE_GOOGLE_SCRIPT }),
  );
  await context.route('https://www.googleapis.com/**', (route) => drive.handle(route));
  return context.newPage();
}

/** Connects Google Drive from Settings, and waits for the first sync. */
async function connect(page: Page): Promise<void> {
  await page.goto('/tabs/settings');
  await page.getByTestId('sync-connect').click();
  await expect(page.getByTestId('sync-status')).toContainText('Synced');
}

test('carries a new list from one device to another through Google Drive', async ({ browser, baseURL }) => {
  const drive = new FakeDrive();
  const options = { ...devices['Pixel 7'], baseURL, storageState: 'e2e/storage-state.json' };
  const phone = await device(await browser.newContext(options), drive);
  const tablet = await device(await browser.newContext(options), drive);

  // The phone connects, makes a list, and syncs.
  await connect(phone);
  await phone.goto('/tabs/lists');
  await phone.getByTestId('new-list').click();
  await phone.locator('ion-alert input').fill('Doubles');
  await phone.locator('ion-alert button', { hasText: 'Create' }).click();
  await expect(phone.getByTestId('list-title')).toHaveText('Doubles');
  await phone.goto('/tabs/settings');
  await phone.getByTestId('sync-now').click();
  await expect.poll(() => drive.files.some((f) => f.text.includes('Doubles'))).toBe(true);
  // Only change files and device files, each named after the device that wrote it.
  expect(drive.files.every((f) => /^[0-9a-f-]{36}\.(\d{6}\.changes|device)\.json$/.test(f.name))).toBe(true);

  // The tablet connects, and has the list.
  await connect(tablet);
  await tablet.goto('/tabs/lists');
  await expect(tablet.getByText('Doubles')).toBeVisible();

  // Disconnecting leaves the files where they are.
  await tablet.goto('/tabs/settings');
  await tablet.getByTestId('sync-disconnect').click();
  await expect(tablet.getByTestId('sync-connect')).toBeVisible();
  expect(drive.files.length).toBeGreaterThan(0);
});

/** Taps Sync now in Settings, and waits for it to finish. */
async function syncNow(page: Page): Promise<void> {
  await page.goto('/tabs/settings');
  await page.getByTestId('sync-now').click();
  await expect(page.getByTestId('sync-status')).toContainText('Synced');
}

/** Opens the only log entry, writes its note, and closes it. */
async function editNote(page: Page, note: string): Promise<void> {
  await page.goto('/tabs/lists/log');
  await page.getByTestId('log-entry').click();
  const sheet = page.locator('ion-modal app-log-entry-sheet');
  await sheet.locator('[data-testid=log-note] textarea').first().fill(note);
  // The note saves a moment after typing stops.
  await page.waitForTimeout(500);
  await sheet.getByTestId('log-sheet-close').click();
  await expect(sheet).toHaveCount(0);
}

test('marks an entry edited on two phones, and settles it on both with the version chosen', async ({
  browser,
  baseURL,
}) => {
  // Two phones through several syncs: longer than most tests, more so when all run at once.
  test.setTimeout(90_000);
  const drive = new FakeDrive();
  const options = { ...devices['Pixel 7'], baseURL, storageState: 'e2e/storage-state.json' };
  const phone = await device(await browser.newContext(options), drive);
  const tablet = await device(await browser.newContext(options), drive);

  // The phone logs M31; both phones have it.
  await phone.goto('/tabs/targets');
  await phone.locator('app-targets ion-searchbar input').fill('M31');
  await expect(phone.locator('app-targets ion-item').first()).toContainText('M31');
  await phone.locator('app-targets ion-item').first().click();
  await phone.getByTestId('mark-seen').click();
  await phone.locator('ion-modal app-log-entry-sheet [data-testid=log-rating] ion-chip', { hasText: 'Great' }).click();
  await phone.locator('ion-modal app-log-entry-sheet').getByTestId('log-sheet-close').click();
  await connect(phone);
  await connect(tablet);

  // Each edits the note before hearing of the other's.
  await editNote(phone, 'Dust lane, from the phone');
  await editNote(tablet, 'Dust lane, from the tablet');
  await syncNow(phone);
  await syncNow(tablet);
  await syncNow(phone);

  // Both mark it, and Settings leads to the choice.
  for (const page of [phone, tablet]) {
    await page.goto('/tabs/lists/log');
    await expect(page.getByTestId('log-conflict')).toHaveAttribute('aria-label', 'Edited on two phones');
  }
  await tablet.goto('/tabs/settings');
  await tablet.getByTestId('open-conflicts').click();
  const conflict = tablet.getByTestId('conflict');
  await expect(conflict).toHaveCount(1);
  const notes = [
    await conflict.getByTestId('conflict-current').textContent(),
    await conflict.getByTestId('conflict-other').textContent(),
  ];
  expect(notes.join()).toContain('from the phone');
  expect(notes.join()).toContain('from the tablet');

  // The tablet keeps the phone's version; the mark goes, here and, once synced, there.
  const phoneSide = notes[0]!.includes('from the phone') ? 'conflict-current' : 'conflict-other';
  await conflict.getByTestId(phoneSide).locator('ion-button').click();
  await expect(tablet.getByTestId('conflicts-empty')).toBeVisible();
  await syncNow(tablet);
  await syncNow(phone);
  for (const page of [phone, tablet]) {
    await page.goto('/tabs/lists/log');
    await expect(page.getByTestId('log-entry')).toContainText('from the phone');
    await expect(page.getByTestId('log-conflict')).toHaveCount(0);
  }
});
