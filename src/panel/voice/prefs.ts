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
 * one read, so it gets one store — **VB-49's `dictationHint`**, whether the
 * OS-dictation line has been seen off, lives here rather than in a second
 * module that would read the same key a second time and disagree with this one
 * for as long as a write took. There is still no microphone anywhere in this
 * product; that hint points at the dictation the operating system already has
 * (see core/flow/dictation.ts).
 *
 * V1.8 VB-42 also stored `followUps` here, and V2.0 VB-57 took it away with
 * the control it existed for — see `DEFAULT_PREFS` below.
 *
 * `loaded` exists for VB-49 only, and for one frame of it: the hint's default
 * is "show", so a component that rendered before the stored answer arrived
 * would flash a hint at someone who dismissed it months ago. Anything whose
 * default is the quiet one — the narrator — can ignore it.
 */

/**
 * Every preference there is, and the value each has when nothing is stored.
 *
 * **This object is also the schema.** `loadPrefs` rebuilds what it read around
 * these keys rather than spreading the stored object over them, so a field
 * that was retired is dropped on the next write instead of riding along in
 * `wb:prefs` for ever. That is how V2.0 VB-57 removes `followUps` — V1.8's
 * memory of the "Show all" press — with no migration: the control is gone
 * (docs/V2.0-REFINEMENT.md FLAG 1), nothing reads the field, and the first
 * time any preference is written the stray key stops being written back.
 */
const DEFAULT_PREFS: Prefs = {
  narrator: false,
  mic: false,
  reducedMotion: 'system',
  handoff: 'manual',
  packUrls: [],
  dictationHint: true,
  turnHint: true,
};

/**
 * The stored object, reduced to the preferences that still exist.
 *
 * Anything missing keeps its default; anything the product no longer declares
 * is left behind. Written as a walk over `DEFAULT_PREFS`'s own keys rather
 * than `{...DEFAULT_PREFS, ...stored}` for exactly that second half.
 */
function knownPrefs(stored: Partial<Prefs>): Prefs {
  const next: Prefs = { ...DEFAULT_PREFS };
  for (const key of Object.keys(DEFAULT_PREFS) as (keyof Prefs)[]) {
    const value = stored[key];
    if (value === undefined) continue;
    // The assignment is sound — `stored[key]` and `next[key]` are the same
    // field of the same type — but TypeScript cannot say so while `key` is a
    // union, and there is no way to write it that it can. One cast, on the
    // target only, so the value keeps its own type (CLAUDE.md: no `any`).
    (next as unknown as Record<string, unknown>)[key] = value;
  }
  return next;
}

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
      publish(stored ? knownPrefs(stored) : prefs);
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
/**
 * V2.9 — TIM's return drop (Adam, 2026-09-02).
 *
 * "When you unmute the narrator during the interview process, before it plays
 * the message, let's have a pre-recorded drop for 'Sorry. I was on mute, where
 * was I?'. It will read as kinda funny and relatable without taking more than
 * a second."
 *
 * Set when the toggle goes OFF→ON, read and cleared by whoever speaks next.
 * A one-shot flag rather than a queued utterance because the drop has to come
 * before whatever the screen would have said anyway, and the screen decides
 * that — queueing here would have TIM apologising into silence on a screen
 * with nothing to read.
 *
 * Not persisted. It belongs to one press, and a drop that survived a reload
 * would apologise for a mute nobody remembers setting.
 */
/* TIM'S RETURN DROP retired here (V3.0 pass 3, the A/B rule): the filler
   moved to NarratorMark's own press, where it plays alone - see
   useNarration.ts for the whole story. */

export async function setNarrator(on: boolean): Promise<void> {
  /* Armed only on the way back ON, only if it was actually off, and only if
     TIM has already spoken at some point — pressing "on" when it is already on
     is not somebody returning from anywhere, and the first enable of a session
     is not a return either. He has to have been interrupted to apologise for
     it. */
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

/**
 * V2.0 VB-71 — whether the globe still has to say it can be turned, and the one
 * call that retires it.
 *
 * The second preference whose default is the *louder* state, so it hands
 * `loaded` back for the same reason `useDictationHintPref` above does: the cue
 * sits on the stage rather than under a question, and one frame of a cue
 * somebody saw off months ago is one frame of the panel forgetting them.
 *
 * Same store, same key, same single read — a second module reading `wb:prefs`
 * on its own would disagree with this one for as long as a write took.
 */
export function useTurnHintPref(): { show: boolean; loaded: boolean; dismiss: () => void } {
  const show = useSyncExternalStore(subscribe, () => prefs.turnHint);
  const ready = useSyncExternalStore(subscribe, () => loaded);
  return { show, loaded: ready, dismiss: () => void setPref('turnHint', false) };
}
