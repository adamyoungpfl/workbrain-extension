import { useEffect, useRef } from 'react';
import { useTurnHintPref, loadPrefs } from '../voice/prefs';
import { S } from '../strings';
import './BrainTurnCue.css';

/**
 * V2.0 VB-71 — the one thing on the stage that says the globe can be turned.
 *
 * docs/V2.0-REFINEMENT.md VB-71: "Nothing on screen says the globe is
 * draggable. Add a one-time cue ... that says it can be moved with the cursor."
 * The words for it have existed since V1.2 and have only ever been *said*:
 * `S.brainGlobeHelp` — "Drag to turn it. Tab to step between sections." — lives
 * in `.brainglobe-sr`, so everybody using a screen reader has been told and
 * everybody looking at the picture has not.
 *
 * ── WHERE IT SITS, AND WHY IT IS NOT A POPUP ──────────────────────────────
 *
 * Adam's annotated screenshot of 2026-08-25 puts it at the top-left of the
 * stage, immediately left of the way-out control, the two side by side as a
 * pair. That placement is the feature, not decoration: a cue in the corner
 * **never covers the thing it is describing**, and it cannot be swiped away by
 * accident before it has been read. A tooltip over the geometry would fail both.
 *
 * While it is up, the way-out DISC steps one target to the right
 * (BrainTurnCue.css) so the pair reads as a pair rather than as two controls
 * fighting for one corner. When the cue retires, the way out takes the corner
 * back. The one control it will not share the corner with is the pill a flown-in
 * section shows — see `paused` below, which is the measured reason.
 *
 * ── INTERACTIVE, NOT DECORATIVE — AND WHY THAT WAS THE CHOICE ─────────────
 *
 * VB-71 asks for the decision to be made explicitly, because "a disc that looks
 * exactly like the back button but does nothing when pressed is the worst of
 * both". This is a REAL BUTTON: 44 x 44, a visible focus ring, an accessible
 * name, and pressing it puts the cue away for good.
 *
 * Interactive won on the copy. A picture cannot carry a sentence, and VB-71
 * requires the cue's words to live in `strings.ts` and hold the reading-level
 * check — so the cue has to *say* something, and the only place a 44px disc can
 * say anything is its name. The name is the tip itself (`S.brainTurnCue`),
 * which is also its `title`, so the pointer user this exists for gets the
 * sentence on hover and everyone else gets it from the control.
 *
 * It is told apart from the way-out control by SHAPE, not by colour: this one
 * is a filled disc with a turning arrow on it, that one is an open rim with a
 * back chevron in it. Nothing here is distinguished by colour alone
 * (docs/GUARDRAILS.md).
 *
 * ── IT NEVER BLOCKS THE FIRST DRAG ────────────────────────────────────────
 *
 * Nothing is scheduled, nothing is awaited and nothing covers the globe. The
 * cue is 44px in the corner of a stage that is 208px across at its resting
 * size; the drag it describes starts anywhere on the other ninety-odd percent
 * of the picture and works from the first frame, whether the cue has been read,
 * pressed or ignored.
 *
 * ── ONCE, AND THEN NEVER ──────────────────────────────────────────────────
 *
 * `wb:prefs.turnHint`, the same store and the same load-then-render pattern as
 * DictationHint — including the part that matters most, which is waiting for
 * `loaded`. This preference's default is the LOUD one, so a component that
 * rendered before storage answered would flash a cue at somebody who saw it off
 * months ago.
 *
 * Three things retire it, and all three mean the same thing — the person now
 * knows:
 *
 *   · they turned the globe with the pointer (`turned`), which is the gesture
 *     this cue exists to teach and the strongest possible signal it worked;
 *   · they pressed the disc, which is somebody saying "read it";
 *   · they left Brain with it on screen (`showing` going false), which is
 *     VB-71's "it appears once, not every visit" — the alternative is a hint
 *     that greets you on the tenth open because you never happened to drag.
 *
 * Retired on a real event rather than in an unmount cleanup, deliberately:
 * Chrome destroys the side panel's document when the panel closes and a cleanup
 * is not a promise you get to keep.
 *
 * ── REDUCED MOTION ────────────────────────────────────────────────────────
 *
 * The arrow draws itself once, in CSS, in 320ms — a single sweep of the mark
 * that is already there rather than a demonstration of the gesture. Under
 * `prefers-reduced-motion` the animation is `none` and the arrow is simply
 * drawn: same disc, same mark, same sentence, same 44px target. The instruction
 * is in the words and the shape, never in the movement, so the still version
 * loses nothing (docs/GUARDRAILS.md). No timer is set in either case — the
 * whole cue schedules nothing at all.
 */
export interface BrainTurnCueProps {
  /** Brain is the mode on screen. The cue is only ever offered on a stage
   * somebody is looking at, and leaving that stage retires it. */
  showing: boolean;
  /** The globe has been turned with the pointer during this panel session. */
  turned: boolean;
  /**
   * Something else owns that corner right now — draw nothing, and spend
   * nothing.
   *
   * There is exactly one such thing, and it is why this prop exists: flying
   * into a section replaces the way-out DISC with `Back to the whole file`, a
   * pill as wide as its own sentence. Stepped sideways to make room for the cue
   * it runs off the end of a 208px stage and wraps onto two lines, which is
   * most of the top of the picture given over to furniture. Measured, not
   * guessed — the pill's right edge lands exactly on the globe's.
   *
   * Distinct from `showing` going false, deliberately. Flying into a section is
   * not somebody learning that the globe turns, so it must not spend the one
   * chance the cue gets; it is the corner being busy, and the cue comes back
   * when it is free.
   */
  paused?: boolean;
}

export function BrainTurnCue({ showing, turned, paused = false }: BrainTurnCueProps) {
  const { show, loaded, dismiss } = useTurnHintPref();

  useEffect(() => {
    void loadPrefs();
  }, []);

  /**
   * Turning the globe retires the cue — they have done the thing it was going
   * to tell them, so there is nothing left to say and nothing to press.
   */
  useEffect(() => {
    if (loaded && show && showing && turned) dismiss();
  }, [loaded, show, showing, turned, dismiss]);

  /**
   * Leaving Brain with the cue on screen retires it too: "once, not every
   * visit". Tracked as a real transition — was up, now is not — rather than as
   * a cleanup, so a closed panel cannot swallow it.
   */
  const wasShowing = useRef(false);
  useEffect(() => {
    if (loaded && show && showing) wasShowing.current = true;
    else if (loaded && show && wasShowing.current && !showing) dismiss();
  }, [loaded, show, showing, dismiss]);

  if (!loaded || !show || !showing || paused) return null;

  return (
    <button
      type="button"
      className="brainturncue"
      /* The sentence, three times over and in one place: the control's name,
         the pointer's tooltip, and the text a screen reader reads if it walks
         the contents rather than the label. */
      aria-label={S.brainTurnCue}
      title={S.brainTurnCue}
      onClick={() => dismiss()}
    >
      {/* A ring with an arrowhead, around the solid it is about. Drawn rather
          than imported — docs/GUARDRAILS.md names an icon-set dependency as a
          thing that looks helpful and is not — and deliberately NOT the back
          chevron next door, because two discs with the same mark on them would
          be one control drawn twice. */}
      <svg className="brainturncue-mark" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
        <path
          className="brainturncue-arc"
          d="M19 12a7 7 0 1 1-2.05-4.95"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <path
          d="M17.4 3.4v4.2h-4.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="2.6" fill="currentColor" />
      </svg>
    </button>
  );
}
