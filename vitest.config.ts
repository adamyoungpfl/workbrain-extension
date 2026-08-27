import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

/**
 * Kept separate from vite.config.ts so @crxjs/vite-plugin's manifest/CRX
 * pipeline never runs in the test context.
 */
export default defineConfig({
  /**
   * BS-00 — the same build stamp the real build defines, from the same
   * literal. Without it `src/core/build.ts` cannot be unit tested at all, and
   * a stamp nobody tests is a stamp that silently becomes wrong.
   *
   * Read as TEXT rather than imported, for the reason this file exists at all
   * (see the header): importing `manifest.config.ts` pulls @crxjs/vite-plugin
   * and esbuild into the test context, which is precisely what is being kept
   * out. `src/core/build.test.ts` extracts the same literal the same way, so
   * the two cannot disagree about what they are testing.
   */
  define: {
    __WB_VERSION__: JSON.stringify(
      /export const VERSION = '([^']+)'/.exec(
        readFileSync(new URL('./manifest.config.ts', import.meta.url), 'utf8'),
      )?.[1] ?? '0.0.0',
    ),
  },
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
      // V2.4: agent worktrees check out under .claude/worktrees/ — whole
      // sibling copies of this repo, each with its own test run. This run
      // must never sweep theirs.
      '**/.claude/**',
    ],
  },
});
