import { useEffect, useState } from 'react';
import {
  TYPE_SPEED_MS,
  charsRevealedAt,
  cueStartedAt,
  type PrintCue,
} from '../../core/motion/typewriter';
import { prefersReducedMotion } from '../cues/verbs';
import './Typed.css';

/**
 * V1.2 VB-10 — questions type themselves in.
 *
 * Two triggers, one mechanic, both already solved in the sibling app
 * (`../modelcitizen/src/components/WorkBrainContextInterview.tsx`: `useTypewriter`
 * animates on mount, `useTypewriterOnChange` only on a change) and one of them
 * already ported once, for the file tree, in components/FileTree.tsx:
 *
 *  - **`TypedHeading`** — the mount-triggered variant. Every question that
 *    arrives types itself in, because every question is new.
 *  - **`TypedModuleLabel`** — the change-triggered variant. `Flow` remounts its
 *    step view on every question, so a mount-triggered label would print
 *    "Orientation" four times in a row. It prints when the module changes and
 *    is simply there the rest of the time.
 *
 * The arithmetic — elapsed time to character count — is pure and lives in
 * core/motion/typewriter.ts with its own tests. What is here is the part that
 * genuinely needs a browser: a clock, a preference, and a keyboard.
 *
 * THREE THINGS VB-10 REQUIRES, AND WHERE EACH ONE IS
 *
 * 1. **Fast.** `TYPE_SPEED_MS` — the spec's 8–12ms band, not a re-tuned value.
 * 2. **Skippable.** Any key, any click, anywhere, finishes the text at once.
 *    See `usePrint`'s window listeners.
 * 3. **Never gates input.** Nothing here touches focus, nothing captures a key
 *    or calls `preventDefault`, and the animation runs in this leaf component
 *    rather than in `Flow` — so the field, the pills and Next are ordinary,
 *    fully working controls from the first frame. The first keystroke of an
 *    answer completes the question text *and* lands in the field, which is the
 *    behaviour someone who already knows the question actually wants.
 *
 * REDUCED MOTION is the whole text, immediately — not a faster print. It is
 * read at the moment a print would start (`printFrom`), not captured once at
 * mount, for the same reason FileTree reads it per transition: the module label
 * outlives forty-nine questions and must not hold a stale preference.
 *
 * NOTHING MOVES WHILE IT PRINTS. The characters not yet typed are in the DOM
 * all along, in a `visibility: hidden` span, so the heading occupies its final
 * box from the first frame. That is not decoration:
 *
 *  - A question is one to three lines at 400px wide. Printed a character at a
 *    time into an empty box, the field and the buttons below it would walk
 *    down the panel as it wrapped — controls moving under the pointer of
 *    someone trying to use them, which is exactly what "never gate input"
 *    forbids in spirit.
 *  - `.flow-q` is `text-wrap: balance` (Flow.css). Balancing is computed over
 *    the element's whole content, so a growing string re-balances on nearly
 *    every character and the text visibly reflows. With the remainder present,
 *    the line breaks are decided once, from the full sentence, and never move.
 *  - `textContent` is therefore always the complete question, mid-print or not.
 *
 * Hidden text is not in the accessibility tree, so while a heading is printing
 * it carries an `aria-label` of the whole question. A screen reader landing on
 * it a tenth of a second after it appeared hears the question, not a fragment,
 * and axe never sees a heading with no accessible name. Once the print is
 * finished the attribute is gone and the markup is exactly what V1.1 shipped.
 *
 * NO BLINKING CARET, deliberately. A caret is one more glyph in the flow of the
 * text: at the end of a full line it either wraps the last word or has to be
 * pulled out of layout entirely, and either way it is the one thing on this
 * screen that would move the question about. The typing itself is what carries
 * "this is being written".
 *
 * The file tree's rows once had one — single-line rows that never wrap could
 * afford it — and V2.0 VB-56 removed that too, so this is now the panel's only
 * position rather than the exception to one (components/FileTree.tsx).
 */

/** What one print looks like at one moment. */
interface Print {
  readonly text: string;
  /** When this print started, or `null` when the whole string is on screen. */
  readonly startedAt: number | null;
  readonly count: number;
}

const clock = (): number => performance.now();

/** A finished print: everything on screen, no timer, nothing animating. */
function whole(text: string): Print {
  return { text, startedAt: null, count: text.length };
}

/**
 * The state a print is in `now`, given when it started.
 *
 * A print that began before this component existed is resumed rather than
 * restarted, and one that already finished is simply whole — which is what
 * makes remount-per-question invisible to the module label.
 */
function printFrom(text: string, startedAt: number): Print {
  if (!text || prefersReducedMotion()) return whole(text);
  const count = charsRevealedAt(clock() - startedAt, text.length);
  return count >= text.length ? whole(text) : { text, startedAt, count };
}

/** Decides when the print of `text` began. The only difference between the two
 * triggers this file exports. */
type StartFor = (text: string) => number;

/** Mount-triggered: it starts now, because this text is arriving now. */
const startNow: StartFor = () => clock();

/**
 * When the module label last changed, on the shared clock.
 *
 * Module scope, and for precisely the reason BrandMark.tsx's `lastCue` is:
 * `Flow` remounts its step view on every question, so anything held in
 * component state would reprint the label forty-nine times per interview
 * instead of once per module. Holding it here means a remount mid-print
 * continues the print, and a remount after it shows the finished label.
 *
 * Ephemeral by construction — a plain variable, alive exactly as long as the
 * panel document. Nothing derived is stored (docs/ARCHITECTURE.md), and
 * reopening the panel prints the label once more, which is correct: it is
 * arriving on screen again.
 */
let labelCue: PrintCue | null = null;

const startOnModuleChange: StartFor = (title) => {
  labelCue = cueStartedAt(labelCue, title, clock());
  return labelCue.startedAt;
};

/** Test seam: forget the remembered module label, so specs start clean. */
export function resetTypedModuleLabelMemory(): void {
  labelCue = null;
}

/**
 * The running print for `text`.
 *
 * The timer is elapsed-driven (see core/motion/typewriter.ts): each tick asks
 * how many characters *should* be showing by now rather than adding one, so a
 * late tick catches up instead of stretching the print.
 *
 * State is recomputed during render when `text` changes — the documented React
 * escape hatch for "derive from props", and the same rule the rest of this
 * surface follows (Flow.tsx's remount-per-position, FileTree's accordion
 * override). Resetting in an effect would render one frame of the *previous*
 * question's progress against the new question's words.
 */
function usePrint(text: string, startFor: StartFor): Print {
  const [print, setPrint] = useState<Print>(() => printFrom(text, startFor(text)));

  let current = print;
  if (current.text !== text) {
    current = printFrom(text, startFor(text));
    setPrint(current);
  }

  const { text: printing, startedAt } = current;

  useEffect(() => {
    if (startedAt === null) return;
    const length = printing.length;

    /** Skip to the end. Same guard on both paths: only ever finishes the print
     * this effect belongs to, so a listener that fires a beat after the text
     * changed cannot complete the wrong string. */
    const finish = () =>
      setPrint((p) => (p.text === printing && p.startedAt !== null ? whole(p.text) : p));

    const tick = setInterval(() => {
      const count = charsRevealedAt(clock() - startedAt, length);
      if (count >= length) {
        finish();
        return;
      }
      setPrint((p) => {
        // Same print, and something new to show: anything else returns the
        // state object unchanged, so React re-renders nothing. A tick that
        // reveals no new character — a coarse clock, a fast machine — must not
        // cost a render, and a tick that belongs to a print this effect has
        // already been replaced by must not overwrite the current one.
        if (p.text !== printing || p.startedAt !== startedAt || p.count === count) return p;
        return { text: printing, startedAt, count };
      });
    }, TYPE_SPEED_MS);

    // VB-10's "skippable": any key, any click, anywhere in the panel. On
    // `window`, in the capture phase, and nothing is consumed — no
    // `preventDefault`, no `stopPropagation` — so the keystroke that skips the
    // animation is also the first character of the answer, and the click that
    // skips it is also the click that picked the pill.
    //
    // A plain `useEffect` rather than a layout effect, deliberately: the very
    // click or Enter that advanced to this question is still propagating when
    // the new screen commits, and a listener attached synchronously during
    // that commit could catch the event that created it.
    window.addEventListener('keydown', finish, true);
    window.addEventListener('pointerdown', finish, true);

    return () => {
      clearInterval(tick);
      window.removeEventListener('keydown', finish, true);
      window.removeEventListener('pointerdown', finish, true);
    };
  }, [printing, startedAt]);

  return current;
}

/**
 * The printed text: what has been typed, followed by what has not, held in
 * layout and out of the accessibility tree. See the module comment.
 */
function TypedRun({ text, count }: { text: string; count: number }) {
  if (count >= text.length) return <>{text}</>;
  return (
    <>
      {text.slice(0, count)}
      <span className="typed-rest" aria-hidden="true">
        {text.slice(count)}
      </span>
    </>
  );
}

export interface TypedHeadingProps {
  /** The whole question. Change it — a rephrasing, a new step — and it prints
   * again from the start. */
  text: string;
  className?: string;
}

/**
 * A flow screen's heading, typing itself in on arrival.
 *
 * A component rather than a hook used inside `StepView`, so that a hundred
 * character-by-character updates re-render this heading and nothing else. The
 * field someone is typing an answer into is not re-rendered by the question
 * above it printing.
 */
export function TypedHeading({ text, className }: TypedHeadingProps) {
  const print = usePrint(text, startNow);
  const stillPrinting = print.count < text.length;
  return (
    <h2 className={className} aria-label={stillPrinting ? text : undefined}>
      <TypedRun text={text} count={print.count} />
    </h2>
  );
}

export interface TypedModuleLabelProps {
  /** The module's own title. Doubles as the cue: when it changes, the module
   * changed, which is the only time this prints. */
  title: string;
  className?: string;
}

/**
 * The status bar's module label — printed when the module changes, and only
 * then.
 *
 * `aria-hidden` is not a decision this component makes on its own: the
 * progressbar around it (components/FlowProgress.tsx) carries the same title as
 * its accessible name, so leaving the paragraph in the tree would announce the
 * module twice. That is V1.1 VB-02's structure, unchanged.
 */
export function TypedModuleLabel({ title, className }: TypedModuleLabelProps) {
  const print = usePrint(title, startOnModuleChange);
  return (
    <p className={className} aria-hidden="true">
      <TypedRun text={title} count={print.count} />
    </p>
  );
}
