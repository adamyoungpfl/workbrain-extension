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
 * ── OPENING IT WITH AN EMPTY BOX SHOWS THE MAP, NOT THE TERRITORY ────────
 *
 * SUPERSEDED in part, V3.0 pass 5 (Adam, 2026-09-02: "That many questions
 * is too many to be helpful if you don't already know what you are looking
 * for"). The empty box now shows the SECTIONS — collapsed, each with its
 * counts — and a section opens on its header's press. What survives of the
 * original doctrine is the part that mattered: the order never changes with
 * the query or with progress, so where a section lives is learnable, and
 * typing anything expands every matching section (a filter that hid its own
 * matches would be broken).
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
  /**
   * V2.9 (Adam, 2026-09-02) — HOME LIVES HERE NOW.
   *
   * The mark in the header used to be the door home, and it has moved to the
   * opposite corner to become the narrator's control. Rather than find the
   * exit a new corner of its own, it joins the one control that already means
   * "take me somewhere else": Adam's own framing — "the label and status bar
   * become the jump to which also lets them get to home."
   *
   * ABOVE the search field and outside the filter, deliberately. Home is not a
   * question and must not be something a person can type themselves out of
   * reach of.
   */
  onHome?: (() => void) | undefined;
}

export function JumpSheet({ open, onClose, targets, onJump, onHome }: JumpSheetProps) {
  const [query, setQuery] = useState('');
  const matches = useMemo(() => jumpMatches(query, targets), [query, targets]);
  /* The sections, in file order, from the matches themselves - grouping
     downstream of the filter so the two can never disagree. */
  const groups = useMemo(() => {
    const order: string[] = [];
    const by = new Map<string, JumpTarget[]>();
    for (const t of matches) {
      if (!by.has(t.section)) {
        by.set(t.section, []);
        order.push(t.section);
      }
      by.get(t.section)!.push(t);
    }
    return order.map((section) => ({ section, targets: by.get(section)! }));
  }, [matches]);
  const [openSections, setOpenSections] = useState<ReadonlySet<string>>(new Set());
  const filtering = query.trim() !== '';

  return (
    <Sheet open={open} onClose={onClose} title={S.jumpTitle} className="jump" full>
      {onHome && (
        /* THE SAVE POINT (Adam, 2026-09-02: "give that home button a bit
           more pop and polish so it feels like an easy 'save point'") - a
           card, not a line: the glyph, the verb, and the promise that
           leaving loses nothing, which is what a save point IS. */
        <button type="button" className="jump-home" onClick={onHome}>
          <span className="jump-home-glyph" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
              <path d="M3.2 9.4 10 3.4l6.8 6" />
              <path d="M5 8.4v7.2h10V8.4" />
              <path d="M8.4 15.6v-4h3.2v4" />
            </svg>
          </span>
          <span className="jump-home-text">
            <span className="jump-home-label">{S.goHome}</span>
            <span className="jump-home-sub">{S.jumpHomeSub}</span>
          </span>
        </button>
      )}

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
        <div className="jump-groups">
          {groups.map((group) => {
            const expanded = filtering || openSections.has(group.section);
            const answered = group.targets.filter((t) => t.answered).length;
            return (
              <section key={group.section} className="jump-group">
                {filtering ? (
                  /* While a query narrows the list, sections are LABELS -
                     forced open, nothing to toggle, and no control that
                     pretends otherwise. */
                  <p className="jump-group-head is-label">
                    <span className="jump-group-name">{group.section}</span>
                    <span className="jump-group-meta">{S.jumpSectionMeta(group.targets.length, answered)}</span>
                  </p>
                ) : (
                  <button
                    type="button"
                    className="jump-group-head"
                    aria-expanded={expanded}
                    onClick={() =>
                      setOpenSections((was) => {
                        const next = new Set(was);
                        if (next.has(group.section)) next.delete(group.section);
                        else next.add(group.section);
                        return next;
                      })
                    }
                  >
                    <span className="jump-group-name">{group.section}</span>
                    <span className="jump-group-meta">{S.jumpSectionMeta(group.targets.length, answered)}</span>
                  </button>
                )}
                {expanded && (
                  <ul className="jump-list">
                    {group.targets.map((target) => (
                      <li key={target.questionId}>
                        <button type="button" className="jump-row" onClick={() => onJump(target.questionId)}>
                          <span className="jump-row-text">
                            <span className="jump-row-q">{target.question}</span>
                          </span>
                          {/* A word, not a tick: the state has to survive a
                              screen with no colour. */}
                          {target.answered && <span className="jump-row-done">{S.jumpAnswered}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}
