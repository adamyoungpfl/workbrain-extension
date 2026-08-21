import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installDevReset } from './devReset';

/**
 * V1.2 VB-09 — the dev-only reset chord, installed once, before the first
 * render so it works even if the tree throws.
 *
 * `import.meta.env.DEV` is replaced with a literal `false` by Vite for
 * `npm run build`, so Rollup removes this branch, `installDevReset` becomes
 * an unused import, and ./devReset (with core/dev/resetChord and
 * core/storage/reset behind it) never reaches dist/. Proven, not assumed —
 * see tests/e2e/dev-reset.spec.ts.
 */
if (import.meta.env.DEV) {
  installDevReset();
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
