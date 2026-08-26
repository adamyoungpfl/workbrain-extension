import { forwardRef, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, KeyboardEvent, ReactNode } from 'react';
import { rovingTarget, toggleChoice } from '../../core/choice/roving';
import { S } from '../strings';
import './Pill.css';

export interface PillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  pressed: boolean;
  suggested?: boolean | undefined;
  /**
   * V2.4 VB-105 — the pill's theme, as a class suffix (`pill-theme-scholar`).
   * Purely a CSS hook: the theme is color + icon and nothing else (FLAG 4),
   * so nothing about the button's behaviour or accessible name may read it.
   */
  tone?: string | undefined;
  /**
   * V2.4 VB-105/VB-108 — a small decorative drawing beside the label. The
   * glyph is `aria-hidden` at the SVG (choiceGlyphs.tsx's convention), so the
   * button's accessible name stays exactly its printed label.
   */
  glyph?: ReactNode | undefined;
}

/** A single choice pill. Selection is carried by fill + weight + a checkmark — never color alone. */
export const Pill = forwardRef<HTMLButtonElement, PillProps>(function Pill(
  { pressed, suggested, tone, glyph, className, children, ...rest },
  ref,
) {
  const classes = ['pill', suggested ? 'suggested' : '', tone ? `pill-themed pill-theme-${tone}` : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button ref={ref} type="button" className={classes} aria-pressed={pressed} {...rest}>
      {glyph && <span className="pill-glyph">{glyph}</span>}
      {children}
    </button>
  );
});

export interface PillOption {
  value: string;
  label: string;
  suggested?: boolean | undefined;
  /** V2.4 VB-105 — theme class suffix; see `PillProps.tone`. */
  tone?: string | undefined;
  /** V2.4 VB-105/VB-108 — decorative drawing; see `PillProps.glyph`. */
  glyph?: ReactNode | undefined;
}

export interface PillGroupProps {
  /** accessible name for the group — usually the question text */
  legend: string;
  options: PillOption[];
  mode: 'single' | 'multi';
  value: string[];
  onChange: (value: string[]) => void;
  /** every pill row ends with "+ add your own" so the list never becomes a cage */
  onAddOwn?: (() => void) | undefined;
}

/**
 * Single-select commits on click and advances nothing — the person still
 * presses Next, because auto-advance removes their sense of control.
 * Arrow keys move a roving tabindex between pills; Space/Enter select via
 * native button activation.
 *
 * V2.0 VB-60: WHERE THE ARROW KEYS AND THE TOGGLE NOW LIVE.
 *
 * They were twenty lines of `switch (e.key)` here. VB-60 gives the roles
 * question a second group that looks nothing like this one
 * (`components/OrbGroup.tsx`) and requires — in the task's own words — that
 * "whatever replaces it keeps ALL of that". Two copies of a keyboard contract
 * are two contracts that agree until somebody edits one, so the arithmetic
 * moved to `core/choice/roving.ts` and both groups call it. Nothing about this
 * component's behaviour changed; what changed is that it is now the same
 * behaviour as the other group's by construction rather than by inspection.
 *
 * Focus stayed here. Moving focus is a DOM act (CLAUDE.md's one architectural
 * rule) — core says which index, this says `.focus()`.
 */
export function PillGroup({ legend, options, mode, value, onChange, onAddOwn }: PillGroupProps) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const count = options.length + (onAddOwn ? 1 : 0);
  const selectedIndex = options.findIndex((o) => value.includes(o.value));
  const [rovingIndex, setRovingIndex] = useState(Math.max(0, selectedIndex));

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

  function toggle(optionValue: string) {
    onChange(toggleChoice(value, optionValue, mode));
  }

  return (
    <div className="pillgroup" role="group" aria-label={legend}>
      {options.map((option, index) => (
        <Pill
          key={option.value}
          ref={(el) => {
            itemRefs.current[index] = el;
          }}
          pressed={value.includes(option.value)}
          suggested={option.suggested}
          tone={option.tone}
          glyph={option.glyph}
          tabIndex={index === rovingIndex ? 0 : -1}
          onClick={() => {
            setRovingIndex(index);
            toggle(option.value);
          }}
          onFocus={() => setRovingIndex(index)}
          onKeyDown={(e) => handleKeyDown(e, index)}
        >
          {option.label}
        </Pill>
      ))}
      {onAddOwn && (
        <button
          ref={(el) => {
            itemRefs.current[options.length] = el;
          }}
          type="button"
          className="pill pill-add"
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
