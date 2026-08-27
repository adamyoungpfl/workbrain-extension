import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Serves tests/e2e/fixtures/harness.html for the a11y layer only — never
 * part of the extension build. No @crxjs/vite-plugin, no manifest. See
 * tests/e2e/a11y.spec.ts and docs/RELEASE-1.md (R1-03 accept: "axe clean").
 */
export default defineConfig({
  root: 'tests/e2e/fixtures',
  plugins: [react()],
  /**
   * BS-00's build stamp, defined here too.
   *
   * This harness renders the REAL components through `src/panel/components`,
   * so anything that barrel exports has to resolve here as well. It did not:
   * the moment the feedback door joined the barrel, `src/core/build.ts`'s
   * `__WB_VERSION__` came with it, was undefined in this config, and the
   * whole harness page failed to mount — taking every cue, deep-dive and
   * a11y test on it down at once. A third config that has to be remembered
   * is a trap, so it is named as one here: **any build-time constant added
   * to vite.config.ts belongs in this file and in vitest.config.ts too.**
   *
   * Read as text rather than imported, for the same reason the other two do
   * it — importing `manifest.config.ts` pulls @crxjs and esbuild in.
   */
  define: {
    __WB_VERSION__: JSON.stringify(
      /export const VERSION = '([^']+)'/.exec(
        readFileSync(new URL('./manifest.config.ts', import.meta.url), 'utf8'),
      )?.[1] ?? '0.0.0',
    ),
  },
  server: { port: 4300, strictPort: true },
});
