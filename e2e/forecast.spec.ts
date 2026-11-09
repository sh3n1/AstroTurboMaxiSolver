import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

const LEVELS = [
  1000, 975, 950, 925, 900, 850, 800, 750, 700, 650, 600, 550, 500, 450, 400, 350, 300, 250, 200, 150, 100, 70, 50, 30,
];

/**
 * A made-up Open-Meteo answer: three days of hours around now over a standard
 * atmosphere, with the cloud building through the day. The tests never call the real service.
 */
function fakeForecast(): object {
  const start = Math.floor(Date.now() / 3_600_000 - 24) * 3600;
  const time = Array.from({ length: 72 }, (_, i) => start + i * 3600);
  const hourly: Record<string, number[]> = {
    time,
    cloud_cover: time.map((_, i) => (i * 7) % 101),
    temperature_2m: time.map((_, i) => 10 + 4 * Math.sin(i / 4)),
    temperature_80m: time.map(() => 11),
    surface_pressure: time.map(() => 940),
  };
  for (const p of LEVELS) {
    const height = p > 226.3 ? 44_331 * (1 - (p / 1013.25) ** 0.19026) : 11_000 + 6_341.6 * Math.log(226.3 / p);
    hourly[`geopotential_height_${p}hPa`] = time.map(() => height);
    hourly[`temperature_${p}hPa`] = time.map(() => (height < 11_000 ? 15 - 0.0065 * height : -56.5));
  }
  return { latitude: 40.4, longitude: -3.7, elevation: 650, hourly };
}

/** Answers the forecast request, or fails it as if offline. */
async function serveForecast(page: Page, available: boolean): Promise<void> {
  await page.route('https://api.open-meteo.com/**', (route) =>
    available ? route.fulfill({ json: fakeForecast() }) : route.abort('internetdisconnected'),
  );
}

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 40.4168, longitude: -3.7038 });
  await page.goto('/');
  await page.locator('[data-testid=location]').click();
  await expect(page.locator('[data-testid=location]')).toHaveText('40.42° N, 3.70° W');
});

test('shows clouds and seeing under the ruler, with when they were updated', async ({ page }) => {
  await serveForecast(page, true);
  // Collapsed when the panel opens, until the button shows the rows.
  await page.locator('[data-testid=open-time]').click();
  await expect(page.locator('[data-testid=time-ruler]')).toBeVisible();
  await expect(page.locator('[data-testid=forecast-status]')).toHaveCount(0);
  await page.locator('[data-testid=expand-time]').click();
  await expect(page.locator('[data-testid=forecast-status]')).toContainText('Updated');
  await page.screenshot({ path: 'test-results/forecast-rows.png' });

  // Hidden again with the same button.
  await page.locator('[data-testid=expand-time]').click();
  await expect(page.locator('[data-testid=forecast-status]')).toHaveCount(0);

  // Left shown, it is still collapsed the next time the panel opens.
  await page.locator('[data-testid=expand-time]').click();
  await page.locator('[data-testid=close-time]').click();
  await page.locator('[data-testid=open-time]').click();
  await expect(page.locator('[data-testid=time-ruler]')).toBeVisible();
  await expect(page.locator('[data-testid=forecast-status]')).toHaveCount(0);
});

test('keeps the last forecast for when there is no connection', async ({ page }) => {
  await serveForecast(page, true);
  await page.locator('[data-testid=open-time]').click();
  await page.locator('[data-testid=expand-time]').click();
  await expect(page.locator('[data-testid=forecast-status]')).toContainText('Updated');

  // Offline after a restart: the kept forecast still shows, with its time.
  await page.unroute('https://api.open-meteo.com/**');
  await serveForecast(page, false);
  await page.reload();
  await page.locator('[data-testid=open-time]').click();
  await page.locator('[data-testid=expand-time]').click();
  await expect(page.locator('[data-testid=forecast-status]')).toContainText('Updated');
});

test('says when there is no forecast at all', async ({ page }) => {
  await serveForecast(page, false);
  await page.locator('[data-testid=open-time]').click();
  await page.locator('[data-testid=expand-time]').click();
  await expect(page.locator('[data-testid=forecast-status]')).toHaveText('No forecast');
});

test('fetches again only once the forecast is 15 minutes old', async ({ page }) => {
  // A controllable clock, so the test can move 16 minutes on without waiting.
  await page.clock.install();
  await page.reload();
  let requests = 0;
  await page.route('https://api.open-meteo.com/**', (route) => {
    requests++;
    return route.fulfill({ json: fakeForecast() });
  });
  await page.locator('[data-testid=open-time]').click();
  await page.locator('[data-testid=expand-time]').click();
  await expect(page.locator('[data-testid=forecast-status]')).toContainText('Updated');
  expect(requests).toBe(1);

  // Closing and opening again straight away uses the forecast already there.
  await page.locator('[data-testid=close-time]').click();
  await page.locator('[data-testid=open-time]').click();
  await page.locator('[data-testid=expand-time]').click();
  await expect(page.locator('[data-testid=forecast-status]')).toContainText('Updated');
  expect(requests).toBe(1);

  // With the panel left open, it updates by itself once 15 minutes have passed.
  await page.clock.fastForward('16:00');
  await expect.poll(() => requests).toBe(2);
});
