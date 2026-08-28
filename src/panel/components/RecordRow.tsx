import { S } from '../strings';
import './RecordRow.css';

/**
 * BS-08 (§8) — one record, as a row. Built once, for two screens.
 *
 * §8's last bullet: "Share the row component with §7.2's list destination —
 * same rows, same rings, same last-row add, built once for light and dark
 * grounds." So this lives in components/ rather than beside Multiples.tsx: the
 * brain's list destination renders the same records, and two components
 * drawing the same fact is two components that agree until one of them is
 * edited.
 *
 * ── WHAT CHANGED FROM THE ROW IT REPLACES ─────────────────────────────────
 *
 * THE SUBTITLE. It read "4 of 5 answered", which §8 calls what it is: "a fact
 * about the form". It now prints the two or three things the record actually
 * holds, in the person's own words, from `core/flow/multiples.ts`'s
 * `recordDetail` — the same formatter the generated file uses, so a row and
 * its heading in Context.md cannot disagree.
 *
 * THE GLYPH. Every row carried an identical card-with-a-line icon, which §8
 * calls "repetitions of no information". In its place, in the same slot, is a
 * ring that draws how much of this record is answered.
 *
 * ── THE RING IS NOT THE ONLY SIGNAL, AND IT IS NOT A SCORE ────────────────
 *
 * `docs/GUARDRAILS.md`: nothing distinguished by colour alone. An incomplete
 * record is told by THREE things — the ring's arc (a shape), the ring's
 * colour, and a word in the row ("2 left"). Any one of them survives on its
 * own.
 *
 * And it is not the banned composite: it is one ratio of two real counts,
 * `answered / total`, the same pair the row used to print in words. The
 * accessible name still says that pair in words, because a drawn fraction is
 * not a fraction anybody can hear.
 */

export interface RecordRowProps {
  /** The record's own name, or the interface's word for one with none. */
  name: string;
  /** Up to three things it holds — `MultipleRecord.detail`. */
  detail: readonly string[];
  answered: number;
  total: number;
  onClick: () => void;
}

/** The ring's geometry. A 20px circle in the icon slot the glyph used to
 * hold, so the row's rhythm is unchanged by the swap. */
const R = 8.5;
const CIRCUMFERENCE = 2 * Math.PI * R;

export function RecordRow({ name, detail, answered, total, onClick }: RecordRowProps) {
  const done = total > 0 ? Math.min(1, answered / total) : 0;
  const left = Math.max(0, total - answered);
  const complete = left === 0;

  return (
    <button
      type="button"
      className={complete ? 'recordrow' : 'recordrow is-partial'}
      onClick={onClick}
    >
      {/* Decoration over the words beside it: the row's accessible name
          already carries the name, the count and what the record holds. */}
      <span className="recordrow-ring" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 22 22">
          <circle className="recordrow-ring-track" cx="11" cy="11" r={R} />
          <circle
            className="recordrow-ring-fill"
            cx="11"
            cy="11"
            r={R}
            strokeDasharray={`${CIRCUMFERENCE * done} ${CIRCUMFERENCE}`}
          />
        </svg>
      </span>
      <span className="recordrow-text">
        <span className="recordrow-name">{name}</span>
        {/* The row is a view of their world, or it says plainly that this one
            is still empty — never a blank line where a fact should be. */}
        <span className="recordrow-detail">
          {detail.length > 0 ? detail.join(' · ') : S.recordNothingYet}
        </span>
      </span>
      {/* The word half of "incomplete". Present only when it is true, so its
          absence is the complete state rather than a second label to read. */}
      {!complete && <span className="recordrow-left">{S.recordLeft(left)}</span>}
      {/* The count in words, for anyone who cannot see the arc. */}
      <span className="recordrow-sr">{S.recordAnswered(answered, total)}</span>
    </button>
  );
}

/** The plus, in the ring's slot. Stroke-based, `currentColor`, `aria-hidden`
 * — the row's own words name it. */
const ADD_MARK = (
  <svg width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M9 3.6v10.8M3.6 9h10.8" strokeLinecap="round" />
  </svg>
);

export interface AddRecordRowProps {
  /** What it says on the row — "Add another person". */
  label: string;
  onClick: () => void;
}

/**
 * BS-08 (§8) — "'Add another' becomes the last row of the list, not a
 * bordered button below it. Reads as one more of the thing above, and saves
 * height per group."
 *
 * Dashed rather than solid, and that is not the edge §6 took away from a
 * locked file card. There, dashed said "this is not available yet", which
 * read as broken. Here it says "this row is a space, not a thing" — the one
 * meaning §1 kept for it, and the only row in the list that is an invitation
 * rather than a record.
 */
export function AddRecordRow({ label, onClick }: AddRecordRowProps) {
  return (
    <button type="button" className="recordrow-add" onClick={onClick}>
      <span className="recordrow-add-mark">{ADD_MARK}</span>
      <span>{label}</span>
    </button>
  );
}
