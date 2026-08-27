import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest, { VERSION } from './manifest.config';

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  /**
   * BS-00 — the build stamp's one source.
   *
   * `src/core/build.ts` reads this and nothing else, so the number the panel
   * prints is the number in the manifest by construction. A second constant
   * somewhere in `src/` would be a thing to forget to bump on the one day it
   * mattered — the day a tester reports something against a build nobody can
   * identify.
   */
  define: {
    __WB_VERSION__: JSON.stringify(VERSION),
  },
});
