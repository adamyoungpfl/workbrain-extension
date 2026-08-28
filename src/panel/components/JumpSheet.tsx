import { useMemo, useState } from 'react';
import { Field } from './Field';
import { Sheet } from './Sheet';
import { jumpMatches } from '../../core/flow/jumpTo';
import type { JumpTarget } from '../../core/flow/jumpTo';
import { S } from '../strings';
import './JumpSheet.css';

/**
 * BS-05f (§5) — "Jump to…", the interview's own search.
 *
 * §5: "Add 'Jump to…' — a filter over the outline you already hold, using
 * `positionForQuestionId`. Forty-nine questions with no search is the one
 * missing utility every comparable browser tool has."
 *
 * ── IT FILTERS THE QUESTIONS, NEVER THE ANSWERS ───────────────────────────
 *
 * `core/flow/jumpTo.ts` searches the flow's own words — the question as the
 * interview asks it and the section it sits in — and nothing the person
 * wrote. That is a line rather than an omission: a filter over answers would
 * be the panel reading somebody's content in order to rank it, and
 * `strings.ts` promises "the panel never reads or scores it".
 *
 * ── OPENING IT WITH AN EMPTY BOX IS A LEGITIMATE USE ──────────────────────
 *
 * Every question, in file order, before a single character is typed. A person
 * who does not know the word to search for is exactly the person who needs
 * this, and a search that shows nothing until you guess correctly is a search
 * for people who already know the answer. The order never changes with the
 * query or with what has been answered, so where a question lives is
 * learnable.
 *
 * ── A SHEET, NOT A MODAL ──────────────────────────────────────────────────
 *
 * `docs/GUARDRAILS.md` allows one overlay and it is this one — "sheets only,
 * and only for short self-contained tasks", which is exactly what picking a
 * question is. Escape closes it and focus goes back to the door, both of
 * which are `Sheet`'s own.
 */

export interface JumpSheetProps {
  open: boolean;
  onClose: () => void;
  /** Every question a person can be sent to — `jumpTargets`. */
  targets: readonly JumpTarget[];
  /** Where a chosen question goes. The caller turns the id into a position
   * with `positionForQuestionId`, which is the door R1-12 already built. */
  onJump: (questionId: string) => void;
}

export function JumpSheet({ open, onClose, targets, onJump }: JumpSheetProps) {
  const [query, setQuery] = useState('');
  const matches = useMemo(() => jumpMatches(query, targets), [query, targets]);

  return (
    <Sheet open={open} onClose={onClose} title={S.jumpTitle} className="jump" full>
      <Field
        id="jump-query"
        label={S.jumpFieldLabel}
        value={query}
        onChange={setQuery}
        placeholder={S.jumpPlaceholder}
      />

      {/* The count is a real number of real things, and it moves as the
          filter narrows — which is the feedback that says the box is doing
          something without a spinner or a message. */}
      <p className="jump-count" role="status">
        {S.jumpCount(matches.length)}
      </p>

      {matches.length === 0 ? (
        <p className="jump-empty">{S.jumpNothing}</p>
      ) : (
        <ul className="jump-list">
          {matches.map((target) => (
            <li key={target.questionId}>
              <button type="button" className="jump-row" onClick={() => onJump(target.questionId)}>
                <span className="jump-row-text">
                  <span className="jump-row-q">{target.question}</span>
                  <span className="jump-row-section">{target.section}</span>
                </span>
                {/* A word, not a tick: the state has to survive a screen with
                    no colour, and "Answered" is the file tree's own claim
                    said in one word. */}
                {target.answered && <span className="jump-row-done">{S.jumpAnswered}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
