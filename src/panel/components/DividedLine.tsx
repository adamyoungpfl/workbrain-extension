import { useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { rovingTarget } from '../../core/choice/roving';
import type { PillOption } from './Pill';
import { S } from '../strings';
import './DividedLine.css';

/**
 * V2.5 VB-122 — the divided line: a track split down its middle, options
 * resting dim and black-and-white on the LEFT, and the chosen one landed on
 * the lighter RIGHT side in full colour. Crossing the line is the answer.
 * Which question is drawn this way is core/choice/dividedLine.ts's
 * `usesDividedLine` — role_for only.
 *
 * ── THREE WAYS ACROSS, ONE MEANING ────────────────────────────────────────
 *
 * A drag that carries an option past the divider crosses it; a plain click
 * crosses it; and — FLAG 4, the a11y floor — focus plus Space/Enter crosses
 * it. All three end in the same `onChange([value])`, which is the exact
 * single-select contract every chips question shares (core/choice/roving.ts's
 * `toggleChoice` single mode, inlined here because the crossed option must
 * also refuse to deselect: dragging or pressing the answer does not empty
 * it). Crossing a second option brings the first back to the left — that is
 * just what single select looks like on this drawing.
 *
 * ── STILL CHIPS + NEXT ────────────────────────────────────────────────────
 *
 * Selection only ever reports through `onChange`; committing is Next's job
 * and never happens here (auto-advance is banned, docs/GUARDRAILS.md). Every
 * option is a real `<button type="button">` with `aria-pressed`, inside a
 * `role="group"` named by the question; arrows rove (both axes), Home/End
 * jump; the add-your-own button is the roving order's last stop, exactly as
 * it is in PillGroup.
 *
 * ── THE CROSSED STATE IS NEVER COLOUR ALONE ───────────────────────────────
 *
 * Position carries it (the option is bodily on the other side of a drawn
 * line), `aria-pressed` carries it, and weight carries it; the
 * grayscale-to-colour flip rides on top as paint. Reduced motion crosses
 * instantly — DividedLine.css drops the transform transition, so the drag
 * and the glide disappear while every landed state stays identical.
 *
 * ── DRAG MECHANICS, BRIEFLY ───────────────────────────────────────────────
 *
 * Pointer events with capture on the option itself. The travel is measured
 * from the DOM at pointer-down (one column plus the row's gap — the same
 * distance the crossed CSS transform names), the inline transform tracks the
 * pointer clamped to [0, travel], and release past the midpoint crosses.
 * Release short of it lets the CSS transition carry the option home. A drag
 * that moved more than a few pixels swallows the click the browser fires
 * after pointer-up, so releasing on the left half never reads as a click.
 */

export interface DividedLineProps {
  /** Accessible name for the group — the question text. */
  legend: string;
  options: PillOption[];
  value: string[];
  onChange: (value: string[]) => void;
  /** The add-your-own door — the same `allowCustom` mechanic every choice
   * group shares; the field itself is the flow's existing custom input. */
  onAddOwn?: (() => void) | undefined;
}

/** Below this many pixels of travel, a release is a click, not a drag. */
const DRAG_CLICK_SLOP = 5;

interface DragState {
  index: number;
  startX: number;
  travel: number;
  dx: number;
}

export function DividedLine({ legend, options, value, onChange, onAddOwn }: DividedLineProps) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const count = options.length + (onAddOwn ? 1 : 0);
  const selectedIndex = options.findIndex((o) => value.includes(o.value));
  const [rovingIndex, setRovingIndex] = useState(Math.max(0, selectedIndex));
  const [drag, setDrag] = useState<DragState | null>(null);
  /** Set when a real drag happened, so the click the browser fires after
   * pointer-up is not taken for a second, contradictory gesture. */
  const swallowClick = useRef(false);

  function focusItem(index: number) {
    setRovingIndex(index);
    itemRefs.current[index]?.focus();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const target = rovingTarget(e.key, index, count);
    if (target === null) return;
    e.preventDefault();
    focusItem(target);
  }

  function cross(optionValue: string) {
    // Single select, and the crossed option never un-crosses itself —
    // toggleChoice's own 'single' rule, kept in one line.
    if (!value.includes(optionValue)) onChange([optionValue]);
  }

  function beginDrag(e: ReactPointerEvent<HTMLButtonElement>, index: number, crossed: boolean) {
    // The answer does not drag — crossing another option is how it changes.
    if (crossed || !e.isPrimary) return;
    const button = e.currentTarget;
    const row = button.parentElement;
    if (!row) return;
    const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
    button.setPointerCapture(e.pointerId);
    setRovingIndex(index);
    setDrag({ index, startX: e.clientX, travel: button.offsetWidth + gap, dx: 0 });
  }

  function moveDrag(e: ReactPointerEvent<HTMLButtonElement>, index: number) {
    if (!drag || drag.index !== index) return;
    const dx = Math.min(drag.travel, Math.max(0, e.clientX - drag.startX));
    setDrag({ ...drag, dx });
  }

  function endDrag(index: number, optionValue: string, cancelled: boolean) {
    if (!drag || drag.index !== index) return;
    if (drag.dx >= DRAG_CLICK_SLOP) swallowClick.current = true;
    if (!cancelled && drag.dx >= drag.travel / 2) cross(optionValue);
    setDrag(null);
  }

  return (
    <div className="dline" role="group" aria-label={legend}>
      <div className="dline-track">
        <span className="dline-divider" aria-hidden="true" />
        {options.map((option, index) => {
          const crossed = value.includes(option.value);
          const dragging = drag?.index === index;
          return (
            <div className="dline-row" key={option.value}>
              <button
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                type="button"
                className={dragging ? 'dline-opt dline-dragging' : 'dline-opt'}
                aria-pressed={crossed}
                tabIndex={index === rovingIndex ? 0 : -1}
                style={dragging ? { transform: `translateX(${drag.dx}px)` } : undefined}
                onPointerDown={(e) => beginDrag(e, index, crossed)}
                onPointerMove={(e) => moveDrag(e, index)}
                onPointerUp={() => endDrag(index, option.value, false)}
                onPointerCancel={() => endDrag(index, option.value, true)}
                onClick={() => {
                  if (swallowClick.current) {
                    swallowClick.current = false;
                    return;
                  }
                  setRovingIndex(index);
                  cross(option.value);
                }}
                onFocus={() => setRovingIndex(index)}
                onKeyDown={(e) => handleKeyDown(e, index)}
              >
                {/* Decorative (aria-hidden at the SVG) — the label is the
                    whole accessible name, so what the button says is exactly
                    what it prints. */}
                {option.glyph && <span className="dline-glyph">{option.glyph}</span>}
                <span className="dline-label">{option.label}</span>
              </button>
            </div>
          );
        })}
      </div>
      {onAddOwn && (
        <button
          ref={(el) => {
            itemRefs.current[options.length] = el;
          }}
          type="button"
          className="dline-add"
          tabIndex={options.length === rovingIndex ? 0 : -1}
          onClick={() => {
            setRovingIndex(options.length);
            onAddOwn();
          }}
          onFocus={() => setRovingIndex(options.length)}
          onKeyDown={(e) => handleKeyDown(e, options.length)}
        >
          {S.addYourOwn}
        </button>
      )}
    </div>
  );
}
