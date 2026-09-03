import { useEffect, useState } from 'react';
import { PeaksSvg } from './PeaksMark';
import { narratorSupported, onSpeechActivity, speak, stopSpeaking } from '../voice/speech';
import { useNarratorPref } from '../voice/prefs';
import { S } from '../strings';
import './NarratorMark.css';

/**
 * V2.9 — THE MARK IS THE NARRATOR (Adam, 2026-09-02).
 *
 * "Dump the TIM character and instead replace that spot with the logo image
 * (no title). It becomes the pulse that goes with the voice of the narrator."
 *
 * TIM lasted one commit and this is better, for a reason worth writing down
 * rather than just complying with. A drawn face is a second character in a
 * product that already has one — the mark — and it asked the interface to
 * carry a personality it never otherwise uses. Worse, at 34px it was a
 * portrait nobody could quite read, doing a job an icon does better. The mark
 * is already the most-learned thing on the screen; making it BREATHE while the
 * questions are read gives the voice a body without inventing a person to
 * own it.
 *
 * It also retires a risk. A drawn Black man at icon scale is a depiction that
 * has to be right, and "right" was a judgement made in code by someone who
 * could not fully make it. The mark carries no such burden.
 *
 * ── THE PULSE IS THE VOICE, NOT A LOOP ────────────────────────────────────
 * `onboundary` fires once per spoken word, so the ring slows where the
 * sentence slows, stops on a comma, and ends when the narrator does. A timer
 * would look approximately right for two seconds and then visibly disagree
 * with what is being said. Under reduced motion the ring holds steady lit
 * instead — "it is speaking" survives, the movement does not.
 *
 * ── AND THE STATE IS A DRAWING ────────────────────────────────────────────
 * Muted is a slash on the corner, present or absent — a whole element, not a
 * dimming, so there is nothing to read as "on but faint" and nothing carried
 * by colour alone.
 */

/** Subscribes to the narrator's own word boundaries. */
export function useSpeechPulse(): { speaking: boolean; word: number } {
  const [state, setState] = useState({ speaking: false, word: 0 });
  useEffect(() => onSpeechActivity(setState), []);
  return state;
}

export function NarratorMark() {
  const { on, setOn } = useNarratorPref();
  const { speaking, word } = useSpeechPulse();

  /* NOT RENDERED AT ALL on a machine that cannot speak. A control offering to
     read the questions aloud, on a browser with no speech engine, does nothing
     when pressed — worse than missing, because somebody presses it and
     concludes the product is broken. Degradation is silent. */
  if (!narratorSupported()) return null;

  return (
    <button
      type="button"
      className="narratormark"
      onClick={() => {
        const next = !on;
        setOn(next);
        /* THE A/B RULE (Adam, 2026-09-02): pressing the mark from B
           (muted) plays the filler ONCE, alone - the acknowledgment - and
           the flip persists, so the next screen reads normally with no
           filler. Pressing from A stops the voice mid-word: the mute must
           be a mute. Unconditional on the press (the old everSpoke guard
           retired with the drop): only a person's own press reaches here -
           the splash's pills write the pref without one, and get no
           filler. */
        if (next) speak({ role: 'question', text: S.timBackDrop });
        else stopSpeaking();
      }}
      aria-label={S.narrator}
      aria-pressed={on}
      data-speaking={speaking ? 'yes' : 'no'}
    >
      {/* THE PEAKS ARE THE VISUALIZER (V3.0 pass 4): the shipped icon's
          three peaks, dancing on the voice. Web Speech exposes no
          amplitude, so the motion rides what it does expose - word
          boundaries: the wrapper is KEYED on the word count, so each
          spoken word remounts it and replays one staggered bounce cycle
          (NarratorMark.css). Between words the peaks settle; muted, they
          flatten and grey. The rings this replaces pulsed on the same
          key, for the same reason. */}
      <span key={`p${word}`} className="narratormark-peaks" aria-hidden="true">
        <PeaksSvg size={30} />
      </span>
      {!on && (
        <span className="narratormark-mute" aria-hidden="true">
          <svg width="9" height="9" viewBox="0 0 12 12">
            <path
              d="M1 1l10 10"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </span>
      )}
    </button>
  );
}
