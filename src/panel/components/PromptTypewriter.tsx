import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { linesAt } from '../../core/flow/typewriter';
import type { TypewriterLine } from '../../core/flow/typewriter';
import './PromptTypewriter.css';

/**
 * V2.9 — the baseline box's starter verb (Adam, 2026-08-31).
 *
 * An example types itself into the empty box; when it is done the next one is
 * written ABOVE it and it descends, dimming a rung per line until it is gone.
 * Every visible line is clickable and drops in whole, so the last three ideas
 * are all still there to be taken rather than only whichever one happens to be
 * on screen at the instant somebody decides to act. All timing is
 * core/flow/typewriter.ts's — this owns a clock and a click and nothing else.
 *
 * The DESCENT is not animated by hand. A new line is inserted at the top of a
 * plain column, so the ones below are pushed down by ordinary layout, and the
 * dimming is a CSS transition on an opacity the core hands over. React keys on
 * the seed index, so an existing line keeps its DOM node and transitions
 * rather than being torn down and rebuilt one rung lower.
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
  /** The examples to cycle. Authored content — see BASELINE_SEEDS. */
  seeds: readonly string[];
  /** Given the whole example, never the fragment on screen. */
  onTake: (seed: string) => void;
  /** Names what taking it does, for the button's accessible name. */
  label: (seed: string) => string;
}

export function PromptTypewriter({ seeds, onTake, label }: PromptTypewriterProps) {
  /* Decided during the first render, not in an effect: an effect would paint
     the animation for one frame before standing it down, which is the exact
     flash somebody who asked for stillness asked not to see. No matchMedia
     reads as "reduce" — the still version is the safe answer. */
  const [reduced] = useState(
    () => typeof window.matchMedia !== 'function' || window.matchMedia(REDUCE_QUERY).matches,
  );

  /* Under reduced motion the stack is a SHORT LIST rather than one frozen
     line. Nothing moves and nothing is scheduled, but the fade ladder is
     dropped too — a dimmed line means "this one is leaving", and with no
     motion there is no leaving for it to mean. Three examples, all at full
     strength, all clickable. That carries more of the instruction than a
     single still line did, which is the standard docs/GUARDRAILS.md sets. */
  const [lines, setLines] = useState<TypewriterLine[]>(() =>
    reduced
      ? seeds.slice(0, 3).map((seed, i) => ({
          seed,
          text: seed,
          index: i,
          age: 0,
          opacity: 1,
          caret: false,
          phase: 'holding' as const,
          takeable: true,
        }))
      : linesAt(0, seeds),
  );

  useEffect(() => {
    if (reduced) return;
    const t0 = performance.now();
    const id = window.setInterval(() => {
      setLines(linesAt(performance.now() - t0, seeds));
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [reduced, seeds]);

  /* Where the box's own text begins, measured off the real textarea. See the
     header for why this is not arithmetic over the stylesheet. */
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [origin, setOrigin] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

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
        /* The width matters now that these are sentences: an overlay that does
           not wrap where the textarea wraps would paint a line straight
           through the box's right edge. Same measurement, same source. */
        width:
          box.width -
          parseFloat(pad.paddingLeft) -
          parseFloat(pad.paddingRight) -
          parseFloat(pad.borderLeftWidth) -
          parseFloat(pad.borderRightWidth),
        /* AND THE HEIGHT, so the stack is CLIPPED to the box it is pretending
           to be inside. The field is a fixed 132px now, and four stacked lines
           are taller than that — without a clip the oldest ones painted
           straight through the bottom border and out onto the page, which is
           exactly the sort of thing that only appears once a neighbouring
           number changes. */
        height:
          box.height -
          parseFloat(pad.paddingTop) -
          parseFloat(pad.paddingBottom) -
          parseFloat(pad.borderTopWidth) -
          parseFloat(pad.borderBottomWidth),
      });
    };
    measure();

    if (typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(measure);
    ro.observe(field);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="prompt-tw-host" ref={hostRef}>
      <div
        className="prompt-tw-stack"
        style={
          origin
            ? {
                top: `${origin.top}px`,
                left: `${origin.left}px`,
                width: `${origin.width}px`,
                maxHeight: `${origin.height}px`,
              }
            : { visibility: 'hidden' }
        }
      >
        {lines.map((line) => (
          <div
            className="prompt-tw-line"
            key={line.index}
            style={{ opacity: line.opacity }}
            /* Painted, never announced. A divider that appears above a line as
               it is pushed down is a picture of the stack moving; a screen
               reader hearing "separator" four times a loop is noise. */
            data-age={line.age}
          >
            <span className="prompt-tw-rule" aria-hidden="true" />
            <button
              type="button"
              className="prompt-tw"
              aria-label={label(line.seed)}
              onClick={() => onTake(line.seed)}
            >
              {/* One inline run, not two flex items: the caret has to sit
                  after the last character of a WRAPPED line, and a flex row
                  would park it beside the whole block instead. */}
              <span className="prompt-tw-word">{line.text}</span>
              {line.caret && <span className="prompt-tw-caret is-lit" aria-hidden="true" />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
