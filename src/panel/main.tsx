import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installDevReset } from './devReset';
import { installAudioTrace, installVoiceAudition } from './voice/audition';

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
  // V1.3 VB-18 — `wbVoices` in the panel's console: every installed voice
  // reading a real interview question, so the narrator's voice is chosen by
  // ear. Stripped from `npm run build` by the same branch, for the same
  // reason — see voice/audition.ts.
  installVoiceAudition();
  installAudioTrace();
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
