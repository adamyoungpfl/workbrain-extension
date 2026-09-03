/**
 * THE ONE ACTIVITY CHANNEL (V3.0 pass 3d). The narrator mark's dance, the
 * aria-live ring — everything that shows "the voice is going" — subscribes
 * HERE, and both sound sources feed it: the speech engine on its own word
 * boundaries, and the clip player on a steady tick (a file has no
 * boundaries to ride). Extracted from speech.ts so clips.ts can drive it
 * without importing the engine — one bus, two producers, any number of
 * listeners.
 */
export type SpeechListener = (state: { speaking: boolean; word: number }) => void;

const listeners = new Set<SpeechListener>();
let spokenWords = 0;

/** Subscribe to voice activity. Returns its own unsubscribe. */
export function onSpeechActivity(fn: SpeechListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function announce(speaking: boolean): void {
  for (const fn of listeners) fn({ speaking, word: spokenWords });
}

/** A fresh utterance or clip starts its word count over. */
export function resetWords(): void {
  spokenWords = 0;
}

/** One more word (or clip tick) — the dance's own heartbeat. */
export function bumpWord(): void {
  spokenWords += 1;
}
