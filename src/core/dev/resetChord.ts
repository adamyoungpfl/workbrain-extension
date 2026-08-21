/**
 * V1.2 VB-09 — the dev-only reset chord, as a pure predicate.
 *
 * The matching lives here, not in the panel, for the usual reason: it is
 * logic with edge cases (auto-repeat, a stray Cmd, a non-US layout) and
 * logic with edge cases belongs in core/ where it can be tested without a
 * browser. The panel module that installs the listener is the only thing
 * that knows a KeyboardEvent exists.
 *
 * Nothing in here is imported outside the `import.meta.env.DEV` branch in
 * src/panel/main.tsx, so Rollup drops the whole module from production —
 * tests/e2e/dev-reset.spec.ts greps dist/ for `CHORD_CODE` and
 * `DEV_RESET_CHORD_LABEL` to prove it, rather than trusting that it did.
 */

/**
 * The subset of KeyboardEvent the predicate reads. A real KeyboardEvent
 * satisfies it structurally, so the panel passes the event straight through.
 */
export interface ChordKeyEvent {
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly metaKey: boolean;
  readonly repeat: boolean;
}

/**
 * Ctrl+Alt+Shift+R. Four keys deep on purpose: this fires while the person
 * is typing an interview answer into a textarea, so anything shorter would
 * eventually eat someone's paragraph. Not a Chrome or macOS default binding,
 * and not Cmd-anything — Cmd+Shift+R is the browser's own hard reload.
 */
export const DEV_RESET_CHORD_LABEL = 'Ctrl+Alt+Shift+R';

/**
 * `code`, not `key`: with Alt held, `key` is the composed character (`®` on
 * a US Mac layout, something else again elsewhere), while `code` stays the
 * physical R key on every layout.
 */
const CHORD_CODE = 'KeyR';

export function isDevResetChord(event: ChordKeyEvent): boolean {
  return (
    event.code === CHORD_CODE &&
    event.ctrlKey &&
    event.altKey &&
    event.shiftKey &&
    // A held chord must reset once, not once per repeat tick, and Cmd/Win
    // held alongside is a different chord that happens to share three keys.
    !event.metaKey &&
    !event.repeat
  );
}
