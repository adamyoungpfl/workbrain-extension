import { useEffect, useState } from 'react';
import { narratorSupported } from '../voice/speech';
import { loadPrefs, useNarratorPref } from '../voice/prefs';
import { S } from '../strings';
import './NarratorToggle.css';

/**
 * V1.3 VB-18 — the narrator toggle: one icon button in the top section, above
 * the progress bar, right-justified.
 *
 * IT IS NOT A SETTINGS PAGE. docs/GUARDRAILS.md rules one out and, in the same
 * breath, names this: "Two toggles live in the header; everything else is a
 * default we chose." This is the first of those two. The second — the
 * microphone — is deferred to its own task after the store submission, because
 * it needs a capture permission and this does not (VB-18, "DECIDED — narrator
 * first, mic deferred"). Nothing here requests any permission.
 *
 * THE GLYPH CARRIES THE STATE, NOT THE COLOUR. On is a speaker with two sound
 * waves; off is the same speaker with a cross beside it. Different shapes,
 * different stroke counts, legible with colour removed entirely —
 * docs/GUARDRAILS.md's "nothing distinguished by colour alone". The fill and
 * the accent are a second signal on top, never the only one, and
 * `aria-pressed` is the third, for anyone who hears the interface rather than
 * sees it.
 *
 * ONE ACCESSIBLE NAME IN BOTH STATES. "Read questions aloud", pressed or not,
 * rather than a label that flips to "Turn narrator off" — a control whose name
 * changes as you use it is a control a screen-reader user has to re-learn every
 * press, and `aria-pressed` already says which way it is set.
 *
 * WHERE THERE IS NO SPEECH ENGINE, THERE IS NO TOGGLE. Not a disabled button,
 * not a note explaining itself: docs/GUARDRAILS.md's degradation rule says the
 * panel does less and says nothing about it. `narratorSupported` is checked
 * after mount rather than during render because a `useSyncExternalStore`
 * subscription and a `useEffect` above it cannot be skipped by an early return.
 */

/**
 * The speaker, its two waves, and the mute cross — one drawing, three parts,
 * the same stroke-based `currentColor` convention as Flow.tsx's REPHRASE_ICON
 * and Home.tsx's PERSON_ICON.
 *
 * The waves and the cross are separate groups because they are what changes:
 * CSS shows one or the other (NarratorToggle.css), so both states are the same
 * drawing with one part swapped rather than two icons that have to be kept
 * looking related.
 *
 * Exported for its unit test — the path data is drawn, not derived, and a test
 * that it is still character-for-character the drawn one is the only thing that
 * catches a digit lost in a refactor.
 */
export const NARRATOR_ICON = (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {/* The speaker itself — the half that is always there. */}
    <path className="narrator-body" d="M4 9.5h3.2L12 5.4v13.2L7.2 14.5H4z" />
    {/* On: sound coming out of it. Two arcs, near and far. */}
    <g className="narrator-waves">
      <path d="M15.4 9.4a3.6 3.6 0 0 1 0 5.2" />
      <path d="M18 6.9a7.2 7.2 0 0 1 0 10.2" />
    </g>
    {/* Off: a cross where the sound would be. Two strokes, not one: a single
        diagonal beside a speaker reads as a stray mark at 18px — drawn, looked
        at, and replaced. The cross is the shape people already know as "off",
        and it is the furthest thing on the page from two curved arcs. */}
    <g className="narrator-mute">
      <path d="M16.1 9.5l5 5" />
      <path d="M21.1 9.5l-5 5" />
    </g>
  </svg>
);

/**
 * The toggle.
 *
 * It takes no props and drills nothing: the preference is a panel-wide store
 * (voice/prefs.ts), which is what lets the same control sit on the question
 * screen and the module transition without either surface owning it.
 */
export function NarratorToggle() {
  const { on, setOn } = useNarratorPref();
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    void loadPrefs();
    // THE SPEECH ENGINE IS NOT WOKEN UP HERE. `narratorSupported` deliberately
    // does not read `window.speechSynthesis` — reading it once costs about
    // 570ms of browser work while Chrome starts the operating system's speech
    // service, and this control mounts on the first screen of the interview
    // for everybody, including everybody who never turns it on. See
    // voice/speech.ts's `narratorSupported` for the measurement and what is
    // checked instead.
    setAvailable(narratorSupported());
  }, []);

  if (!available) return null;

  return (
    <div className="narrator">
      <button
        type="button"
        className="narrator-toggle"
        aria-pressed={on}
        aria-label={S.narrator}
        title={S.narrator}
        onClick={() => setOn(!on)}
      >
        {NARRATOR_ICON}
      </button>
    </div>
  );
}
