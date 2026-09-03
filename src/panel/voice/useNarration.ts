import { useEffect, useRef } from 'react';
import type { Narration } from '../../core/voice/narration';
import { speak, stopSpeaking } from './speech';

/**
 * V1.3 VB-18 — reads this screen, and stops the moment it is no longer this
 * screen.
 *
 * ONE EFFECT, AND ITS CLEANUP IS THE WHOLE FEATURE. Every way a narrator turns
 * hateful is a way of still talking about something the person has left, and
 * all of them are the same cleanup here:
 *
 *  - **Advancing, skipping, going back, jumping from the file tree.** `Flow`
 *    mounts `StepView` with `key={positionKey(position)}`, so a new position is
 *    a new component: React unmounts the old one — running this cleanup —
 *    before the new one's effects run. The cancel is not scheduled, not
 *    debounced, and cannot be beaten by the next utterance.
 *  - **Turning it off.** `on` is a dependency, so switching it off runs the
 *    cleanup on that render. Mid-word, mid-sentence, immediately.
 *  - **A rephrasing.** The text changes, so the old utterance is cancelled and
 *    the new wording is read from the start — the voice and the screen never
 *    disagree about which question is being asked.
 *  - **Closing the panel.** `speech.ts` cancels on `pagehide` as well.
 *
 * NOTHING IS SPOKEN THAT WAS NOT ASKED FOR. With `on` false this hook touches
 * no speech API at all — it does not construct an utterance, and it does not
 * cancel one it never started.
 *
 * IT DOES NOT WAIT FOR THE TYPEWRITER, AND THAT IS A DECISION (V1.2 VB-10).
 * Narration starts the instant the question arrives, alongside the print,
 * because:
 *
 *  1. **The print is always ahead of the voice.** Typing runs at ~100
 *     characters a second (core/motion/typewriter.ts's 8–12ms band); speech
 *     runs at ~15. A twenty-word question finishes printing in about a second
 *     and takes seven to read, so the word being spoken is already on screen —
 *     for the whole utterance, on every question in the ported data. Waiting
 *     would buy nothing and cost a second of silence on every screen.
 *  2. **The print is skippable and the voice must not depend on it.** Any key
 *     or click finishes the text early (Typed.tsx). Gating speech on an
 *     animation that may or may not complete on its own would make the
 *     narrator's timing a function of whether someone happened to touch the
 *     keyboard.
 *  3. **VB-10's rule is that nothing waits for it**, and a voice waiting for
 *     an animation is the same failure as a field waiting for one.
 */
export function useNarration(narration: Narration | null, on: boolean): void {
  const role = narration?.role;
  const text = narration?.text ?? '';
  /* THE A/B RULE (Adam, 2026-09-02, V3.0 pass 3): a page that OPENS with
     the speaker on (A) reads normally; a page that opened with it off (B)
     has already presented its question in print, so flipping the speaker
     on mid-page does NOT re-read it — the mark's own filler acknowledges
     the flip, and the NEXT screen (a fresh mount, a fresh narration) reads
     normally with no filler. Tracked as "consumed while off": a narration
     seen with the speaker off is spent for this mount.

     This retires TIM'S RETURN DROP, the prepended apology
     ("Sorry — I was on mute…") that used to ride the re-read: the filler
     moved to the mark's press (NarratorMark.tsx), where it plays alone,
     and the re-read it decorated is gone. */
  const spent = useRef<string | null>(null);

  useEffect(() => {
    if (!role || !text) return;
    const key = `${role}:${text}`;
    if (!on) {
      spent.current = key;
      return;
    }
    if (spent.current === key) return;
    /* NOT marked spent here, and the omission is load-bearing: dev builds
       run under StrictMode, which mounts every effect twice - speak,
       cleanup-cancel, run again. Marking on the speak path made the second
       run skip and every dev screen went silent (Adam's own dogfood found
       it; the production gates never could). Spent means PRESENTED WHILE
       MUTED - the only reading the A/B rule needs - and a re-run whose
       cleanup just cancelled the utterance correctly speaks again. */
    speak({ role, text });
    return () => stopSpeaking();
  }, [on, role, text]);
}
