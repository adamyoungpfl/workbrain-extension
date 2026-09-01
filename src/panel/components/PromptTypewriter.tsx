import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { frameAt } from '../../core/flow/typewriter';
import type { TypewriterFrame } from '../../core/flow/typewriter';
import './PromptTypewriter.css';

/**
 * V2.9 — the baseline box's starter verb (Adam, 2026-08-31).
 *
 * A verb types itself into the empty box, its caret blinks, it erases, and the
 * next one follows. Clicking it drops that word into the box with a trailing
 * space and puts the caret after it, so the shortest path into this question
 * already starts with a command. All timing is core/flow/typewriter.ts's —
 * this owns a clock and a click and nothing else.
 *
 * ── IT IS AN OVERLAY, NOT A PLACEHOLDER, AND HAS TO BE ────────────────────
 * A real `placeholder` cannot be clicked and cannot carry the shimmer, which
 * are the two things it is for. So the field's own placeholder is emptied and
 * this is painted over the box — which means it has to land exactly where the
 * text caret will, or taking a word would visibly shift what is written.
 *
 * The offset is MEASURED rather than computed from the stylesheet. Deriving it
 * would mean hard-coding the label's line height and the field's padding in
 * two places and keeping them in step forever; a `ResizeObserver` on the
 * textarea gets it right by construction, including when the label wraps to
 * two lines in a narrower panel.
 *
 * ── MOTION AND ACCESSIBILITY ──────────────────────────────────────────────
 * Under `prefers-reduced-motion` there is NO clock and not one frame is
 * scheduled: the first verb is painted whole and still, and it is still
 * clickable — the instruction survives the stillness, which is the floor
 * docs/GUARDRAILS.md sets for every cue.
 *
 * It is a real button, so it is reachable by keyboard and named. It is NOT a
 * live region: a word changing every two seconds through `aria-live` would be
 * unusable chatter. A screen reader meets it on Tab, hears what taking it
 * does, and is otherwise left alone.
 */

/** The clock's resolution. Fine enough that a 34ms erase step never doubles. */
const TICK_MS = 24;

const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';

export interface PromptTypewriterProps {
  /** The verbs to cycle. Authored content — see BASELINE_VERBS. */
  words: readonly string[];
  /** Given the whole word, never the fragment on screen. */
  onTake: (word: string) => void;
  /** Names what taking it does, for the button's accessible name. */
  label: (word: string) => string;
}

export function PromptTypewriter({ words, onTake, label }: PromptTypewriterProps) {
  /* Decided during the first render, not in an effect: an effect would paint
     the animation for one frame before standing it down, which is the exact
     flash somebody who asked for stillness asked not to see. No matchMedia
     reads as "reduce" — the still version is the safe answer. */
  const [reduced] = useState(
    () => typeof window.matchMedia !== 'function' || window.matchMedia(REDUCE_QUERY).matches,
  );

  const [frame, setFrame] = useState<TypewriterFrame>(() =>
    reduced
      ? { text: words[0] ?? '', word: words[0] ?? '', index: 0, phase: 'holding', caret: false, takeable: (words[0] ?? '') !== '' }
      : frameAt(0, words),
  );

  useEffect(() => {
    if (reduced) return;
    const t0 = performance.now();
    const id = window.setInterval(() => {
      setFrame(frameAt(performance.now() - t0, words));
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [reduced, words]);

  /* Where the box's own text begins, measured off the real textarea. See the
     header for why this is not arithmetic over the stylesheet. */
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [origin, setOrigin] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    const field = host?.parentElement?.querySelector('textarea, input');
    if (!host || !(field instanceof HTMLElement)) return;

    const measure = () => {
      const box = field.getBoundingClientRect();
      /* The button is positioned against THE HOST — `.prompt-tw-host` is the
         `position: relative` frame — so the offset has to be measured from the
         host's own box. Measuring from `offsetParent` put the word 550px below
         the field, which is the kind of error that only shows up on screen. */
      const frameBox = host.getBoundingClientRect();
      const pad = getComputedStyle(field);
      setOrigin({
        top: box.top - frameBox.top + parseFloat(pad.paddingTop) + parseFloat(pad.borderTopWidth),
        left:
          box.left - frameBox.left + parseFloat(pad.paddingLeft) + parseFloat(pad.borderLeftWidth),
      });
    };
    measure();

    if (typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(measure);
    ro.observe(field);
    return () => ro.disconnect();
  }, []);

  const word = frame.word || words[0] || '';

  return (
    <div className="prompt-tw-host" ref={hostRef}>
      <button
        type="button"
        className="prompt-tw"
        // Hidden from the pointer in the gap between words, so a click on
        // nothing cannot commit the word that is about to appear.
        disabled={!frame.takeable}
        style={origin ? { top: `${origin.top}px`, left: `${origin.left}px` } : { visibility: 'hidden' }}
        aria-label={label(word)}
        onClick={() => onTake(word)}
      >
        <span className="prompt-tw-word">{frame.text}</span>
        <span
          className={frame.caret ? 'prompt-tw-caret is-lit' : 'prompt-tw-caret'}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}
