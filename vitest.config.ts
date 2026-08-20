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
    setupFiles: ['./tests/setup.ts'],
    // Vitest's own defaults, plus tests/e2e/** — those are Playwright specs
    // (they use @playwright/test's own test/describe), not Vitest's, and
    // sharing the *.spec.ts naming convention means Vitest would otherwise
    // try to run them too and fail on the API mismatch.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*',
      'tests/e2e/**',
    ],
  },
});
