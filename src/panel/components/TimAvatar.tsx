import { useEffect, useState } from 'react';
import { narratorSupported, onSpeechActivity } from '../voice/speech';
import { useNarratorPref } from '../voice/prefs';
import { S } from '../strings';
import './TimAvatar.css';

/**
 * V2.9 — TIM, the narrator's face (Adam, 2026-09-02).
 *
 * "An avatar/icon in the top right corner of the interview and baseline page
 * that will be the control for mute/unmute, mic, jump to, etc. but will also
 * have a conversation effect around or in the icon that pulses as the narrator
 * voice registers. It should subtly tie and personalize the voice as a
 * friendly help."
 *
 * TIM is Technology Implementation Management. He is the read-aloud control,
 * and while he is reading, the ring around him moves on the WORDS.
 *
 * ── HE IS DRAWN, FOR THE SAME REASONS THE SPLASH PANELS ARE ───────────────
 * No asset to licence, nothing to fetch, no decode to fail, and he is crisp at
 * any size because he is geometry. Every colour is a token, so he is inside
 * the one-source-of-colour rule rather than an exception carved out of it.
 *
 * ── AND HE IS DRAWN CAREFULLY, WHICH IS WORTH SAYING OUT LOUD ─────────────
 * Adam's brief: African American, friendly, and plausible as a man with a
 * British accent — "nothing that would make that seem implausible or purely
 * affectation." At 34px the whole face is about twelve shapes, and twelve
 * shapes is exactly where a portrait of a Black man slides into caricature if
 * nobody is watching for it.
 *
 * So: natural proportions, no feature exaggerated relative to any other, a
 * coiled crown drawn as a soft scalloped silhouette rather than as texture
 * scribble, one ink used sparingly for brows, eyes and mouth, and a small
 * closed smile rather than a wide one. The warmth is meant to come from the
 * expression and the sweater, not from anything about the face being pushed.
 *
 * This is a judgement call made in code by someone who cannot fully judge it.
 * It is written down here so it can be looked at and overruled rather than
 * inherited by accident.
 *
 * ── ACCESSIBILITY ─────────────────────────────────────────────────────────
 * The drawing is decoration on a real button, and the button's name is what it
 * DOES, not who it is: somebody arriving on Tab needs "read aloud", not "Tim".
 * The pulse is `aria-hidden` and announces nothing — a ring that moved a live
 * region every spoken word would be unusable.
 */

export interface TimAvatarProps {
  /** Painted 34px, pressed 44 — the split every control in this panel makes. */
  size?: number;
}

/**
 * THE CONTROL. Pressing him turns the narrator on and off.
 *
 * He owns that state himself rather than taking it as props, for the same
 * reason `NarratorToggle` did: there is one narrator preference, and a second
 * component holding its own copy is a second thing to keep in step. His
 * accessible name is the ACTION — "read questions aloud" — never the
 * character, because somebody arriving on Tab needs to know what the button
 * does, not who is drawn on it. He is introduced by name nowhere in the
 * interface, which is the right amount for a mascot: present, not announced.
 */
export function Tim() {
  const { on, setOn } = useNarratorPref();
  const { speaking, word } = useSpeechPulse();

  /* NOT RENDERED AT ALL ON A MACHINE THAT CANNOT SPEAK — the same guard
     `NarratorToggle` carries, and the narrator suite is what caught its
     absence here. A face offering to read the questions aloud, on a browser
     with no speech engine, is a control that does nothing: worse than missing,
     because a person presses it and concludes the product is broken.

     Degradation is silent, per docs/GUARDRAILS.md: the corner is simply empty
     and the interview is identical in every other respect. */
  if (!narratorSupported()) return null;

  const muted = !on;
  return (
    <button
      type="button"
      className="tim"
      onClick={() => setOn(!on)}
      aria-label={S.narrator}
      aria-pressed={on}
      data-speaking={speaking ? 'yes' : 'no'}
    >
      {/* Keyed on the word count so the breath RESTARTS on each spoken word.
          Without the key React keeps the same element and the animation runs
          once, at the start of a sentence, and then never again. */}
      <span key={`r${word}`} className="tim-ring" aria-hidden="true" />
      <span key={`t${word}`} className="tim-ring tim-ring--trail" aria-hidden="true" />
      <TimFace />
      {muted && (
        <span className="tim-mute" aria-hidden="true">
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

/** The face. A pure drawing; every colour is a token. */
export function TimFace({ size = 34 }: TimAvatarProps) {
  return (
    <svg
      className="tim-face"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      {/* The ground he sits on, so he reads as a portrait rather than as a
          cut-out floating on whatever is behind him. */}
      <circle cx="24" cy="24" r="24" className="tim-ground" />
      <clipPath id="tim-clip">
        <circle cx="24" cy="24" r="24" />
      </clipPath>
      <g clipPath="url(#tim-clip)">
        {/* Shoulders. The sweater is the one warm note that is not skin. */}
        <path d="M4 48c0-8.5 8.9-13 20-13s20 4.5 20 13z" fill="var(--tim-wear)" />
        {/* Neck, shaded so the head sits in front of the shoulders rather than
            on top of them. */}
        <path d="M19 30h10v8c0 2-10 2-10 0z" fill="var(--tim-skin-shade)" />
        {/* Ears, before the face so they sit behind its edge. */}
        <ellipse cx="12.4" cy="24" rx="2.4" ry="3.4" fill="var(--tim-skin-shade)" />
        <ellipse cx="35.6" cy="24" rx="2.4" ry="3.4" fill="var(--tim-skin-shade)" />
        {/* The head. A soft oval — natural proportions, no narrowing at the
            jaw and no widening at the cheek. */}
        <path
          d="M24 9c7.2 0 11.6 4.8 11.6 12.4 0 8.2-5 14.4-11.6 14.4S12.4 29.6 12.4 21.4C12.4 13.8 16.8 9 24 9z"
          fill="var(--tim-skin)"
        />
        {/* THE CROWN. A scalloped silhouette rather than drawn strands: at this
            size individual coils turn to noise, and a shape that reads
            instantly is more respectful than texture that reads as scribble. */}
        <path
          d="M11.6 21.6c-.6-6 3-11.9 9.2-13.2 6.6-1.4 12.6 1.6 14.8 7 1 2.4 1.1 4.6.8 6.4-.5-1-1.3-1.5-2-1.7-.5-2.6-2.3-3.6-4.4-3.2-2 .4-3-.8-5.2-1.2-2.6-.5-4 .9-6.2 1.6-2.2.7-3.7.4-4.8 1.5-.9.9-1.3 1.9-1.4 3-.4.1-.7.4-.8-.2z"
          fill="var(--tim-hair)"
        />
        <g fill="var(--tim-line)">
          {/* Brows: short, level, unexaggerated. */}
          <rect x="17.1" y="20.2" width="5.2" height="1.5" rx=".75" />
          <rect x="25.7" y="20.2" width="5.2" height="1.5" rx=".75" />
          {/* Eyes. */}
          <ellipse cx="19.7" cy="24" rx="1.55" ry="1.75" />
          <ellipse cx="28.3" cy="24" rx="1.55" ry="1.75" />
        </g>
        {/* A small closed smile. Friendly, not broad. */}
        <path
          d="M20.4 29.4c1.9 1.6 5.3 1.6 7.2 0"
          fill="none"
          stroke="var(--tim-line)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

/**
 * The ring, moving on the narrator's words.
 *
 * `word` ticks once per `onboundary`, and the ring restarts its breath on each
 * tick — so it slows where the sentence slows, stops on a comma, and ends when
 * he does. Under reduced motion the ring holds a steady lit state instead:
 * "he is speaking" survives, the movement does not.
 */
export function useSpeechPulse(): { speaking: boolean; word: number } {
  const [state, setState] = useState({ speaking: false, word: 0 });
  useEffect(() => onSpeechActivity(setState), []);
  return state;
}
