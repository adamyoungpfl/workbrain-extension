import { defineConfig } from 'vitest/config';

/**
 * Kept separate from vite.config.ts so @crxjs/vite-plugin's manifest/CRX
 * pipeline never runs in the test context.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    passWithNoTests: true,
  },
});
