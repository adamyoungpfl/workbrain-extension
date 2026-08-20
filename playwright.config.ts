import process from 'node:process';
import { defineConfig } from '@playwright/test';

/**
 * Extension tests load dist/ as an unpacked extension via
 * chromium.launchPersistentContext directly in each spec — see docs/TESTING.md.
 * Two projects so `npm run e2e` and `npm run a11y` stay independent layers
 * instead of the a11y pass silently re-running inside the e2e one.
 *
 * webServer serves the R1-03 component harness (tests/e2e/fixtures/) —
 * not part of the extension build — so the a11y project has real markup to
 * scan. Harmless to start for the e2e project too; it's just unused there.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  webServer: {
    command: 'npx vite --config vite.harness.config.ts',
    url: 'http://localhost:4300/harness.html',
    reuseExistingServer: !process.env.CI,
  },
  use: { baseURL: 'http://localhost:4300' },
  projects: [
    { name: 'e2e', testMatch: '**/*.spec.ts', testIgnore: '**/*.a11y.spec.ts' },
    { name: 'a11y', testMatch: '**/*.a11y.spec.ts' },
  ],
});
