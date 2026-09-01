import { useEffect } from 'react';
import type { Narration } from '../../core/voice/narration';
import { speak, stopSpeaking } from './speech';
import { takeNarratorDrop } from './prefs';
import { S } from '../strings';

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

  useEffect(() => {
    if (!on || !role || !text) return;
    /* TIM'S RETURN DROP. Prepended to the line he was going to read anyway,
       rather than spoken as a separate utterance: two utterances would put a
       synthesiser's own gap between the apology and the question, which is
       exactly the beat that makes a joke land late. One breath, one sentence,
       then straight on with the work.

       Claimed here rather than in the toggle, because "the next thing that
       gets read" is a thing only this hook knows about — and on a screen with
       nothing to narrate there is nothing to apologise into. */
    const drop = takeNarratorDrop() ? `${S.timBackDrop} ` : '';
    speak({ role, text: `${drop}${text}` });
    return () => stopSpeaking();
  }, [on, role, text]);
}
