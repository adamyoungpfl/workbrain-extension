import { defineConfig } from '@playwright/test';

/**
 * Extension tests load dist/ as an unpacked extension via
 * chromium.launchPersistentContext directly in each spec — see docs/TESTING.md.
 * Two projects so `npm run e2e` and `npm run a11y` stay independent layers
 * instead of the a11y pass silently re-running inside the e2e one.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  projects: [
    { name: 'e2e', testMatch: '**/*.spec.ts', testIgnore: '**/*.a11y.spec.ts' },
    { name: 'a11y', testMatch: '**/*.a11y.spec.ts' },
  ],
});
