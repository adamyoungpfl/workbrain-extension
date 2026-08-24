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
 *
 * V1.8: IT IS NO LONGER ONLY THE NARRATOR'S STORE. `wb:prefs` is one key and
 * one read, so it gets one store — two things that are not voice now live
 * here rather than in a second module that would read the same key a second
 * time and disagree with this one for as long as a write took:
 *
 * - **VB-42's `followUps`** — the follow-up links' visible stop (WCAG 2.2.2),
 *   remembered so it is one press rather than one per question.
 * - **VB-49's `dictationHint`** — whether the OS-dictation line has been seen
 *   off. There is still no microphone anywhere in this product; that hint
 *   points at the dictation the operating system already has (see
 *   core/flow/dictation.ts).
 *
 * `loaded` exists for VB-49 only, and for one frame of it: the hint's default
 * is "show", so a component that rendered before the stored answer arrived
 * would flash a hint at someone who dismissed it months ago. Anything whose
 * default is the quiet one — the narrator, the rotation — can ignore it.
 */

const DEFAULT_PREFS: Prefs = {
  narrator: false,
  mic: false,
  reducedMotion: 'system',
  handoff: 'manual',
  packUrls: [],
  followUps: 'rotate',
  dictationHint: true,
};

let prefs: Prefs = DEFAULT_PREFS;
let loaded = false;
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
      loaded = true;
      publish(stored ? { ...DEFAULT_PREFS, ...stored } : prefs);
    } catch {
      // No storage, or storage refused: the defaults are already in memory and
      // the panel carries on with them. Never surfaced. `loaded` still turns
      // true — the answer is "there is nothing stored", which is an answer.
      loaded = true;
      publish(prefs);
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
  await setPref('narrator', on);
}

/**
 * Set one preference and write the whole object back.
 *
 * The whole object because `wb:prefs` is one item and every other field has to
 * survive the write — `setNarrator` has always done this, and V1.8 gave the
 * key two more fields to lose. Same order as before, for the same reason: in
 * memory first so the interface changes on the press, storage second so a
 * refused write costs the person nothing they can see (docs/GUARDRAILS.md's
 * degradation rule).
 */
export async function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): Promise<void> {
  if (prefs[key] === value) return;
  const next: Prefs = { ...prefs, [key]: value };
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
  loaded = false;
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

/**
 * V1.8 VB-42 — whether the follow-ups still rotate, and the press that stops
 * them for good. Same store, same live read as the narrator: the control that
 * stops the rotation is inside the thing that is rotating, and the next
 * question's copy of that thing has to already know.
 */
export function useFollowUpsPref(): { mode: Prefs['followUps']; showAll: () => void } {
  const mode = useSyncExternalStore(subscribe, () => prefs.followUps);
  return { mode, showAll: () => void setPref('followUps', 'all') };
}

/**
 * V1.8 VB-49 — whether the OS-dictation hint is still to be shown, and the
 * one call that retires it.
 *
 * `loaded` is handed back with it because this is the one preference whose
 * default is the *louder* state: rendering before the stored answer arrives
 * would show a dismissed hint again for a frame. Nothing here touches a
 * microphone, a permission or a capability.
 */
export function useDictationHintPref(): { show: boolean; loaded: boolean; dismiss: () => void } {
  const show = useSyncExternalStore(subscribe, () => prefs.dictationHint);
  const ready = useSyncExternalStore(subscribe, () => loaded);
  return { show, loaded: ready, dismiss: () => void setPref('dictationHint', false) };
}
