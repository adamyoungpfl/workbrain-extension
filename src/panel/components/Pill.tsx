import { forwardRef, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, KeyboardEvent } from 'react';
import { S } from '../strings';
import './Pill.css';

export interface PillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  pressed: boolean;
  suggested?: boolean | undefined;
}

/** A single choice pill. Selection is carried by fill + weight + a checkmark — never color alone. */
export const Pill = forwardRef<HTMLButtonElement, PillProps>(function Pill(
  { pressed, suggested, className, children, ...rest },
  ref,
) {
  const classes = ['pill', suggested ? 'suggested' : '', className].filter(Boolean).join(' ');
  return (
    <button ref={ref} type="button" className={classes} aria-pressed={pressed} {...rest}>
      {children}
    </button>
  );
});

export interface PillOption {
  value: string;
  label: string;
  suggested?: boolean | undefined;
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
 */
export function PillGroup({ legend, options, mode, value, onChange, onAddOwn }: PillGroupProps) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const count = options.length + (onAddOwn ? 1 : 0);
  const selectedIndex = options.findIndex((o) => value.includes(o.value));
  const [rovingIndex, setRovingIndex] = useState(Math.max(0, selectedIndex));

  function focusItem(index: number) {
    const wrapped = (index + count) % count;
    setRovingIndex(wrapped);
    itemRefs.current[wrapped]?.focus();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        focusItem(index + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        focusItem(index - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusItem(0);
        break;
      case 'End':
        e.preventDefault();
        focusItem(count - 1);
        break;
      default:
        break;
    }
  }

  function toggle(optionValue: string) {
    if (mode === 'multi') {
      onChange(
        value.includes(optionValue)
          ? value.filter((v) => v !== optionValue)
          : [...value, optionValue],
      );
    } else {
      onChange([optionValue]);
    }
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
