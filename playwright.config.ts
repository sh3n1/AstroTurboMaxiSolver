import { defineConfig, devices } from '@playwright/test';

const devServerURL = 'http://localhost:4210';
const productionURL = 'http://localhost:4211';
/** A published copy to check, set by scripts/deploy.mjs. Then only its PWA tests run, there. */
const publishedURL = process.env['DEPLOY_URL'];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'on-first-retry',
    // As if the app had been used before: the first-time welcome and the reasons for each
    // permission already seen, so they don't stand in the way. permissions.spec.ts starts fresh.
    storageState: 'e2e/storage-state.json',
  },
  projects: publishedURL
    ? [{ name: 'published', testMatch: 'pwa.spec.ts', use: { ...devices['Pixel 7'], baseURL: publishedURL } }]
    : [
        {
          name: 'Mobile Chrome',
          testIgnore: 'pwa.spec.ts',
          use: { ...devices['Pixel 7'], baseURL: devServerURL },
        },
        {
          // The service worker only runs in production builds.
          name: 'Mobile Chrome (production build)',
          testMatch: 'pwa.spec.ts',
          use: { ...devices['Pixel 7'], baseURL: productionURL },
        },
      ],
  // A published copy needs no local servers.
  webServer: publishedURL
    ? []
    : [
        {
          command: 'npm start -- --port 4210',
          url: devServerURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
        {
          command: 'npm run build && node e2e/serve-www.mjs 4211',
          url: productionURL,
          // Always rebuild, so these tests can't pass against a stale build.
          reuseExistingServer: false,
          timeout: 180_000,
        },
      ],
});
