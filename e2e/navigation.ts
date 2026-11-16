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
    await wakeMap(page);
    await page.getByTestId('more').click();
    await page.getByTestId('open-settings').click();
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
 * With the sensors on, the map's buttons fade after a while without a touch, and take no
 * taps until the map is touched. A touch away from the reticle brings them back.
 */
export async function wakeMap(page: Page): Promise<void> {
  const controls = page.getByTestId('controls');
  if ((await controls.count()) === 0) return;
  if (!(await controls.evaluate((element) => element.classList.contains('faded')))) return;
  await page.locator('app-sky canvas').click({ position: { x: 20, y: 200 } });
  await controls.and(page.locator(':not(.faded)')).waitFor();
}

/**
 * One of the sky map's tiles under More, such as Lists, alignment, night or the time. Opens
 * More first, unless it is open already.
 */
export async function moreTile(page: Page, testId: string): Promise<Locator> {
  if (!(await page.getByTestId('more-sheet').isVisible())) {
    await wakeMap(page);
    await page.getByTestId('more').click();
  }
  return page.getByTestId('more-sheet').getByTestId(testId);
}

/** Taps one of the sky map's tiles under More. */
export async function tapMore(page: Page, testId: string): Promise<void> {
  await (await moreTile(page, testId)).click();
}
