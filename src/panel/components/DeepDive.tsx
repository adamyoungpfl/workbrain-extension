import { useState } from 'react';
import type { DeepDiveEntry } from '../../schema/flow.types';
// Deliberately reuses Pill.css's `.pill` visual language rather than
// re-deriving a second chip look: same radius, same 44px floor, same hover
// and focus ring. `.deepdive-chip` only quiets it down and adds the
// open/closed marker — a deep-dive trigger is not a choice, so it must read
// as lighter than the pills it sits above.
import './Pill.css';
import './DeepDive.css';

/**
 * The open/closed marker: a chevron that points right when closed and down
 * when open. Drawn rather than typed — the obvious `▸`/`▾` characters render
 * as an all-but-invisible dot in the panel's own font stack, which would
 * leave fill and weight as the only signals and put the disclosure straight
 * through docs/GUARDRAILS.md's "nothing distinguished by colour alone".
 * Stroke-based, `currentColor`, `aria-hidden` — the same convention as
 * Home.tsx's PERSON_ICON. Rotation is driven by a class, not a CSS
 * attribute selector, so it is assertable without a stylesheet.
 */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={open ? 'deepdive-mark is-open' : 'deepdive-mark'}
      viewBox="0 0 16 16"
      width="11"
      height="11"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M6 3.5 L10.5 8 L6 12.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface DeepDiveProps {
  /** Namespaces the generated answer element ids — must be unique on screen. */
  idPrefix: string;
  entries: DeepDiveEntry[];
}

/**
 * V1.1 VB-03 — the deeper-dive disclosure. A row of small chips under a
 * question; tapping one reveals its answer inline, tapping it again closes it.
 *
 * Design notes, all deliberate:
 * - **Nothing takes focus.** Opening and closing only re-render; the trigger
 *   itself is never re-focused and no scroll is forced, so the question stays
 *   where the person left it. That is VB-03's own accept criterion.
 * - **Each chip toggles independently.** More than one can be open. An
 *   accordion that closed a neighbour would move text the person is mid-read.
 * - **The answer element always exists**, hidden rather than unmounted, so
 *   `aria-controls` always points at a real node.
 * - **Open is never signalled by colour alone** (docs/GUARDRAILS.md): the
 *   chevron turns to point down and the label goes bold as well.
 * - An open item takes a full row so its answer sits directly under its own
 *   chip — closed chips still pack side by side.
 *
 * The copy is not here: these are per-question strings from
 * src/core/flow/deepDive.ts, passed in. See that file's header for why they
 * are not in strings.ts.
 */
export function DeepDive({ idPrefix, entries }: DeepDiveProps) {
  const [openIndexes, setOpenIndexes] = useState<ReadonlySet<number>>(() => new Set<number>());

  function toggle(index: number) {
    setOpenIndexes((current) => {
      const next = new Set(current);
      if (!next.delete(index)) next.add(index);
      return next;
    });
  }

  return (
    <div className="deepdive">
      {entries.map((entry, index) => {
        const open = openIndexes.has(index);
        const answerId = `${idPrefix}-deepdive-${index}`;
        return (
          <div key={answerId} className={open ? 'deepdive-item is-open' : 'deepdive-item'}>
            <button
              type="button"
              className="pill deepdive-chip"
              aria-expanded={open}
              aria-controls={answerId}
              onClick={() => toggle(index)}
            >
              <Chevron open={open} />
              {entry.q}
            </button>
            <p id={answerId} className="deepdive-answer" hidden={!open}>
              {entry.a}
            </p>
          </div>
        );
      })}
    </div>
  );
}
