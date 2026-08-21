import { useSyncExternalStore } from 'react';
import { getSync, setSync } from '../../core/storage/client';
import type { Prefs } from '../../schema/storage.types';

/**
 * V1.3 VB-18 — `Prefs.narrator`, read and written from the one toggle that
 * owns it.
 *
 * WHY THIS IS A STORE AND NOT `useState` IN THE TOGGLE. `Flow` remounts its
 * step view on every question (see Flow.tsx's `key={positionKey(position)}`),
 * so the toggle is a new component forty-nine times an interview. State inside
 * it would mean a storage read per question — and, for the couple of hundred
 * milliseconds that read takes, a narrator that believes it is off. The value
 * is read once per panel, held here, and every mount of the toggle and every
 * narration effect reads the same snapshot synchronously.
 *
 * WHY SYNC STORAGE. `wb:prefs` lives in `chrome.storage.sync` — it is a
 * preference, not the person's content, so it settles across their devices
 * (docs/ARCHITECTURE.md; docs/V1.3-REFINEMENT.md VB-18 calls this out by
 * name). Answers never go there. Nothing derived is stored: this is a stated
 * preference, which is the one category that is.
 *
 * WHY IT NEVER THROWS. Storage can fail, and docs/GUARDRAILS.md is explicit
 * that a failed write keeps the in-memory state rather than losing it or
 * announcing itself. A narrator preference that would not save is the smallest
 * possible version of that: the toggle still works for this session, and the
 * panel says nothing.
 *
 * The second header toggle — the microphone — is deferred to its own task with
 * its own permission decision (VB-18, "DECIDED — narrator first, mic
 * deferred"). When it arrives it extends this store; `Prefs.mic` already
 * exists and is already preserved by every write here.
 */

const DEFAULT_PREFS: Prefs = {
  narrator: false,
  mic: false,
  reducedMotion: 'system',
  handoff: 'manual',
  packUrls: [],
};

let prefs: Prefs = DEFAULT_PREFS;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publish(next: Prefs): void {
  prefs = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The whole preference object as it currently stands. A stable reference
 * between changes, which is what `useSyncExternalStore` requires. */
export function currentPrefs(): Prefs {
  return prefs;
}

/** Reads `wb:prefs` once per panel. Every later call is the same promise, so
 * forty-nine mounts of the toggle make one storage read. */
export function loadPrefs(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    try {
      const stored = await getSync('wb:prefs');
      if (stored) publish({ ...DEFAULT_PREFS, ...stored });
    } catch {
      // No storage, or storage refused: the defaults are already in memory and
      // the panel carries on with them. Never surfaced.
    }
  })();
  return loading;
}

/**
 * Sets the narrator preference and writes it back.
 *
 * In-memory first, storage second, deliberately: the voice starts or stops on
 * the press, not on the round-trip, and a write that fails leaves the toggle
 * exactly where the person put it.
 */
export async function setNarrator(on: boolean): Promise<void> {
  if (prefs.narrator === on) return;
  const next: Prefs = { ...prefs, narrator: on };
  publish(next);
  try {
    await setSync('wb:prefs', next);
  } catch {
    // Same rule as above — the session keeps the choice, nothing is said.
  }
}

/** Test seam: forget everything this module is holding. Exported for unit
 * tests, which need a store that has not already read a fake storage. */
export function resetPrefsMemory(): void {
  prefs = DEFAULT_PREFS;
  loading = null;
  listeners.clear();
}

/**
 * The narrator preference, live.
 *
 * `useSyncExternalStore` rather than an effect that copies the value into
 * component state: the toggle and the narration effect must agree within a
 * single render, or a press would flip the icon one frame before it stopped
 * the voice.
 */
export function useNarratorPref(): { on: boolean; setOn: (on: boolean) => void } {
  const on = useSyncExternalStore(subscribe, () => prefs.narrator);
  return { on, setOn: (next) => void setNarrator(next) };
}
