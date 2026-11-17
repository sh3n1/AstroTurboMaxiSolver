import type { Locator, Page } from '@playwright/test';

/** The app's main pages, as the user reaches them. Search is the old Targets tab. */
export type MainPage = 'Sky' | 'Lists' | 'Search' | 'Settings';

/**
 * Goes to one of the main pages the way a user would: there is no tab bar, so from the
 * map through its buttons, and back to the map with the arrow at the top of Lists and
 * Settings. From a page deeper in, such as one list, it goes through the hidden tab
 * buttons Ionic keeps, as the browser's back steps would.
 */
export async function openPage(page: Page, name: MainPage): Promise<void> {
  const url = page.url();
  const onSky = /\/tabs\/sky/.test(url);
  const onTop = /\/tabs\/(lists|settings)(\?|#|$)/.test(url);

  if (name === 'Sky') {
    if (onSky) return;
    if (onTop) await page.getByTestId('back-to-map').filter({ visible: true }).click();
    else await page.locator('ion-tab-button[tab=sky]').dispatchEvent('click');
    return;
  }
  if (name === 'Settings') {
    if (!onSky) await openPage(page, 'Sky');
    await tapMore(page, 'open-settings');
    return;
  }
  // Lists and its search. The map's button goes back to the page of Lists left last.
  if (onSky) {
    await tapMore(page, 'open-lists');
  } else {
    await page.locator('ion-tab-button[tab=lists]').dispatchEvent('click');
  }
  if (name === 'Search' && !/\/tabs\/lists\/search/.test(page.url())) {
    await page.waitForURL(/\/tabs\/lists/);
    if (!/\/tabs\/lists\/search/.test(page.url())) await page.getByTestId('search-all').click();
  }
}

/**
 * Opens the sky map's menu, unless it is open already. A user taps the map; this uses the
 * hidden button screen readers have, so a test never lands its tap on something drawn there.
 */
export async function openMenu(page: Page): Promise<void> {
  if (await page.getByTestId('more-sheet').isVisible()) return;
  await page.getByTestId('open-menu').dispatchEvent('click');
  // Its tiles take taps a moment after it appears, so a double tap can't hit one by accident.
  await page.locator('[data-testid=more-sheet][data-ready=true]').waitFor();
}

/** Closes the sky map's menu with a tap on the map, away from the rings, as a user would. */
export async function closeMenu(page: Page): Promise<void> {
  if (!(await page.getByTestId('more-sheet').isVisible())) return;
  await page.locator('app-sky canvas').click({ position: { x: 20, y: 120 } });
  await page.getByTestId('more-sheet').waitFor({ state: 'detached' });
}

/**
 * One of the tiles in the sky map's menu, such as the sensors, the view, Lists or the time.
 * Opens the menu first, unless it is open already.
 */
export async function moreTile(page: Page, testId: string): Promise<Locator> {
  await openMenu(page);
  return page.getByTestId('more-sheet').getByTestId(testId);
}

/** Taps one of the sky map's tiles under More. */
export async function tapMore(page: Page, testId: string): Promise<void> {
  await (await moreTile(page, testId)).click();
}
