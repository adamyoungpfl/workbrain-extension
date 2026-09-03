import { useSyncExternalStore } from 'react';

/**
 * THE VOICE COVER (V3.0 pass 3c; Adam, in dogfood with working audio:
 * "during the white out transition and then throughout the loading
 * sequence, I was getting single and simultaneous readings of copy from
 * maybe the baseline prompt… before any buttons are hit").
 *
 * The panel renders the RESUMED SURFACE under the splash the whole time —
 * that is VB-34's first-paint guarantee — and the splash marks it `inert`
 * so it cannot be pressed. But inert silences fingers, not narrators: any
 * surface whose narration mounts with the speaker on read its question
 * UNDER the intro and the reveal, colliding with the splash's own cues.
 * The bug was always there; it needed audible audio to be heard.
 *
 * So the cover is the voice's own inert: App raises it exactly while the
 * splash is showing, useNarration declines to speak (and declines to mark
 * anything spent) while it is up, and lowering it re-runs the hooks so
 * the screen a person actually lands on reads once, on arrival. The
 * splash's OWN cues (the intro voiceover, the radio, the count) speak
 * through `speak()` directly and are deliberately not covered — the
 * splash owns its audio.
 *
 * A module store rather than context: narration is already module-level
 * (speech.ts), and the one writer is App.
 */
let covered = false;
const listeners = new Set<() => void>();

export function coverVoice(on: boolean): void {
  if (covered === on) return;
  covered = on;
  for (const listener of listeners) listener();
}

export function voiceCovered(): boolean {
  return covered;
}

export function useVoiceCover(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => covered,
  );
}
