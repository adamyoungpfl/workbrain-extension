import { isDevResetChord, DEV_RESET_CHORD_LABEL } from '../core/dev/resetChord';
import { clearAllStorage } from '../core/storage/reset';
import type { StorageResult } from '../core/storage/client';

/**
 * V1.2 VB-09 — a reset that exists only while dogfooding.
 *
 * Resetting used to mean opening DevTools on the panel and running
 * `chrome.storage.local.clear()` by hand, on every single test pass. This
 * replaces that with Ctrl+Alt+Shift+R (core/dev/resetChord.ts) anywhere in
 * the panel.
 *
 * Why this is not the settings page docs/GUARDRAILS.md forbids: it never
 * reaches a real user. `src/panel/main.tsx` calls `installDevReset()` inside
 * `if (import.meta.env.DEV)`, which Vite replaces with a literal `false` for
 * `npm run build`; Rollup then drops the branch, the import goes unused, and
 * this module — plus the two core modules it pulls in — leave the bundle
 * entirely. tests/e2e/dev-reset.spec.ts greps every emitted chunk to prove
 * that, because "it should tree-shake" is not evidence.
 *
 * For the same reason there is no visible affordance, no string in
 * strings.ts, and no CSS: a shipped guardrail cannot be broken by something
 * that is not shipped, but it very much can be broken by a stray button that
 * survives the build.
 */

/**
 * Also a grep target for the production-bundle test — a literal that only
 * this feature could have put there.
 */
const DEV_RESET_LOG = '[workbrain] dev reset';

export interface DevResetOptions {
  /** Injected by the unit test; defaults to the real both-areas wipe. */
  clear?: () => Promise<StorageResult<void>>;
  /**
   * Injected by the unit test, because jsdom cannot navigate. A full reload
   * is the reset: it drops every piece of in-memory session state (the
   * drawer's height, the current `Position`, `Home`'s cached answers) along
   * with storage, and lands back on the welcome screen with no reopen.
   * Re-rendering the React tree would clear storage but keep whatever the
   * panel already held, which is precisely the state we are trying to escape.
   */
  reload?: () => void;
}

/**
 * Installs the chord listener on `window`. Returns an uninstall function.
 *
 * Capture phase, so it still fires when focus is inside a textarea or a
 * component that stops keydown propagation on its way up.
 */
export function installDevReset({
  clear = clearAllStorage,
  reload = () => window.location.reload(),
}: DevResetOptions = {}): () => void {
  let running = false;

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!isDevResetChord(event)) return;
    event.preventDefault();
    // Two chords in the same tick would race two clears against one reload.
    if (running) return;
    running = true;

    void clear().then((result) => {
      if (result.ok) {
        console.info(`${DEV_RESET_LOG} (${DEV_RESET_CHORD_LABEL}) — storage cleared, reloading`);
        reload();
        return;
      }
      // Dev-only, so this says what went wrong — the opposite of the
      // user-facing rule in docs/GUARDRAILS.md, and deliberately so: the
      // person reading it is the one who can fix it. No reload, because
      // reloading onto half-cleared storage hides the failure.
      running = false;
      console.warn(`${DEV_RESET_LOG} failed: ${result.reason}`);
    });
  };

  window.addEventListener('keydown', onKeyDown, { capture: true });
  return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
}
