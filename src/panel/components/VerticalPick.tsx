import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { rovingTarget, toggleChoice } from '../../core/choice/roving';
import type { PillOption } from './Pill';
import './VerticalPick.css';

/**
 * V2.5 VB-118 — the vertical pick, grown up: free-standing icon tiles with a
 * modern radio indicator. This is the component the seam
 * `core/choice/verticalPick.ts` points `context_scope` at, and the grammar
 * VB-123's merged role screen reuses (its `size="compact"` face).
 *
 * ── DELIBERATELY NOT A BUTTON-LOOK ────────────────────────────────────────
 *
 * V2.4's treatment stood the ordinary pills up as rows; Adam's VB-118 note
 * asks for something that shows off "in subtle but powerful ways" and is
 * "deliberately not a button". So a tile has no border and no fill at rest —
 * the drawn glyph stands free over its label, and the interactive affordance
 * is the RADIO RING under each label, the one control shape everybody already
 * reads as "pick one of these". Selection is carried by the filled dot (a
 * shape, not a colour), the label's weight, and a soft tint wash — never
 * colour alone (docs/GUARDRAILS.md).
 *
 * ── WHAT DID NOT CHANGE (the VB-108 contract, held) ───────────────────────
 *
 * Underneath, every tile is still a real `<button type="button">` with
 * `aria-pressed`, inside a `role="group"` named by the question. Selection
 * only ever calls `onChange` — committing is Next's job, and NEVER happens
 * here (auto-advance is banned). The keyboard is the same contract every
 * choice group shares: a roving tabindex whose arithmetic is
 * core/choice/roving.ts's `rovingTarget` (arrows both axes, Home/End), with
 * Space/Enter left to native button activation. Focus stays here — core says
 * which index, this calls `.focus()` (CLAUDE.md's one architectural rule).
 *
 * ── SINGLE ONLY ───────────────────────────────────────────────────────────
 *
 * Every question this grammar serves (context_scope; VB-123's two facets) is
 * a single select, so `mode` is not a prop — `toggleChoice(…, 'single')` is
 * the one behaviour, and a radio treatment offering multi-select would be a
 * lie in the drawing.
 */

export interface VerticalPickProps {
  /** Accessible name for the group — the question, or a facet's own prompt. */
  legend: string;
  options: PillOption[];
  value: string[];
  onChange: (value: string[]) => void;
  /**
   * V2.5 VB-123 — `compact` is the merged role screen's second facet: the
   * same tile anatomy at marker scale (smaller disc, tighter padding), so
   * "pick the standing, mark current or past" reads as one grammar twice
   * rather than two different controls.
   */
  size?: 'default' | 'compact' | undefined;
}

export function VerticalPick({ legend, options, value, onChange, size }: VerticalPickProps) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = options.findIndex((o) => value.includes(o.value));
  const [rovingIndex, setRovingIndex] = useState(Math.max(0, selectedIndex));

  function focusItem(index: number) {
    setRovingIndex(index);
    itemRefs.current[index]?.focus();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const target = rovingTarget(e.key, index, options.length);
    if (target === null) return;
    e.preventDefault();
    focusItem(target);
  }

  return (
    <div
      className={size === 'compact' ? 'vpick vpick-compact' : 'vpick'}
      role="group"
      aria-label={legend}
    >
      {options.map((option, index) => (
        <button
          key={option.value}
          ref={(el) => {
            itemRefs.current[index] = el;
          }}
          type="button"
          className="vpick-tile"
          aria-pressed={value.includes(option.value)}
          tabIndex={index === rovingIndex ? 0 : -1}
          onClick={() => {
            setRovingIndex(index);
            onChange(toggleChoice(value, option.value, 'single'));
          }}
          onFocus={() => setRovingIndex(index)}
          onKeyDown={(e) => handleKeyDown(e, index)}
        >
          {/* The free-standing drawing. Decorative (aria-hidden at the SVG,
              choiceGlyphs.tsx's convention) — the label below is the whole
              accessible name, so the button says exactly what it prints. */}
          {option.glyph && <span className="vpick-glyph">{option.glyph}</span>}
          <span className="vpick-label">{option.label}</span>
          {/* The radio mark. Pure paint: aria-pressed above is the state the
              accessibility tree reads, and this span holds no text so the
              accessible name stays exactly the label. */}
          <span className="vpick-radio" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
