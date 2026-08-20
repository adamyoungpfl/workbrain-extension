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
  server: { port: 4300, strictPort: true },
});
