import type { CSSProperties, ReactNode } from 'react';
import type { NodeSummary } from '../../core/flow/nodeSummary';
import type { NodeDetail } from '../../core/flow/nodeDetails';
import {
  leafActionIsPrimary,
  leafBlockIsDashed,
  leafOrbIsHollow,
} from '../../core/globe/leafState';
import type { LeafState } from '../../core/globe/leafState';
import { S } from '../strings';
import './LeafCard.css';

/**
 * BS-07c (§7.2) — what a leaf holds, as one card of five parts.
 *
 * §7.2's complaint about what it replaces: "Selecting a sub-node currently
 * renders `brainglobe-detail` as a definition list from `nodeDetails`,
 * question label first. So a leaf holding a list and a leaf holding one answer
 * look identical, a list leaf has no count, and there is no route to the
 * editor or statement of what the field is for."
 *
 * ── FIVE PARTS, FIXED ORDER, AND ONLY ONE OF THEM VARIES ──────────────────
 *
 *   1. Header — the node's own orb, its name, and the close.
 *   2. Purpose line — what the field is FOR. Absent is legal (§7.4).
 *   3. Value block — the only variant: an answer, or a count and a noun.
 *   4. State chip — exactly one, or none.
 *   5. Action — one full-width button, 46px min, never two.
 *
 * Parts 1, 4 and 5 sit in identical positions across both variants, which is
 * §7.2's acceptance in as many words: the card is one shape wearing one of six
 * states, not two cards that happen to look alike.
 *
 * ── THE HARD CONSTRAINT ───────────────────────────────────────────────────
 *
 * §7.2, verbatim: "No item name, per-item field, or item preview renders
 * anywhere in the brain view. If a design question can only be answered by
 * naming an item, the answer is that it belongs in the editor."
 *
 * So the list variant prints a COUNT and a NOUN and never "Priya Raman", and
 * the incomplete line states the fact without naming what is unfinished. This
 * is exactly why §8's `RecordRow` — which prints names, because it is the
 * editor — is NOT shared with this card. What the two share is the
 * destination: part 5's action opens the list §8 built.
 *
 * ── THE ACTION IS PINNED ──────────────────────────────────────────────────
 *
 * The card's middle scrolls where the stage is short (core/globe/leafCard.ts
 * has the arithmetic and why); the header and the action do not. Being able
 * to act always matters more than seeing all of a summary at once, and an
 * action that scrolls out of a 208px stage is an action nobody finds.
 */

export interface LeafCardProps {
  /** The node's own name, as the FILE spells it — "2.1 Roles". */
  label: string;
  /** Which of §7.3's six the card is wearing. */
  state: LeafState;
  /** The node's gradient index, so its orb is the same object it was on the
   * stage a moment ago. */
  gradient: number;
  /** Everything countable about the node. `null` is the empty state. */
  summary: NodeSummary | null;
  /** The node's answers, for the answer variant. Never used by the list
   * variant — see the hard constraint. */
  details: readonly NodeDetail[];
  /** §7.4's one new field. Undefined renders no part 2 and closes the gap. */
  purpose?: string | undefined;
  /** Where the card sits on the stage, from `leafCardBand`. */
  top: number;
  height: number;
  onClose: () => void;
  onAct: () => void;
}

const CLOSE_MARK = (
  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
    <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

/**
 * Part 4. EXACTLY ONE, OR NONE — §7.2 says so, and the reason is that two
 * chips on a 250px card is a row of metadata rather than a state.
 *
 * Which one: a node that is unfinished says so, because that is the thing
 * somebody would act on; otherwise the age, because for a finished node "how
 * old" is the only open question. A node with neither gets no chip and the
 * card closes the gap.
 */
function chipFor(state: LeafState, summary: NodeSummary | null): string | null {
  if (!summary) return null;
  if (state === 'list-incomplete' || (summary.skipped > 0 && state !== 'answer-skipped')) {
    return state === 'list-incomplete'
      ? S.summaryAnswered(summary.answered, summary.total)
      : S.sectionSkipped(summary.skipped);
  }
  if (summary.ageDays === 0) return S.summaryToday;
  if (summary.elapsed) return S.summaryAge(S.agoLabel(summary.elapsed.value, summary.elapsed.unit));
  return null;
}

/** Part 5's word, from the state alone. */
function actionWordFor(state: LeafState): string {
  switch (state) {
    case 'answer-filled':
    // O1: a skipped answer offers the SAME change a filled one does. The
    // product does not re-raise a decision somebody already made.
    case 'answer-skipped':
      return S.leafChangeAnswer;
    case 'answer-empty':
      return S.leafAnswerThis;
    case 'list-empty':
      return S.leafStartList;
    case 'list-healthy':
    case 'list-incomplete':
      return S.leafOpenList;
  }
}

/** Part 3, the answer variant: their own answers, in file order. */
function AnswerBlock({ state, details }: { state: LeafState; details: readonly NodeDetail[] }) {
  if (state === 'answer-skipped') return <p className="leafcard-blank">{S.leafSkipped}</p>;
  if (details.length === 0) return <p className="leafcard-blank">{S.leafNothingYet}</p>;
  return (
    <ul className="leafcard-answers">
      {details.map((cell, index) => (
        <li key={`${cell.group}-${cell.label}-${index}`}>{cell.value}</li>
      ))}
    </ul>
  );
}

/** Part 3, the list variant: a count, a noun, and never a name. */
function ListBlock({ state, summary }: { state: LeafState; summary: NodeSummary | null }) {
  const items = summary?.items ?? 0;
  if (items === 0) return <p className="leafcard-blank">{S.leafNothingYet}</p>;
  const left = summary ? Math.max(0, summary.total - summary.answered) : 0;
  return (
    <>
      <p className="leafcard-count">
        <span className="leafcard-count-n">{items}</span>
        <span className="leafcard-count-noun">{S.leafItemsNoun(items)}</span>
      </p>
      {state === 'list-incomplete' && left > 0 && (
        <p className="leafcard-norm">{S.leafIncomplete(left)}</p>
      )}
    </>
  );
}

export function LeafCard({
  label,
  state,
  gradient,
  summary,
  details,
  purpose,
  top,
  height,
  onClose,
  onAct,
}: LeafCardProps) {
  const chip = chipFor(state, summary);
  const isList = state.startsWith('list-');
  const body: ReactNode = isList ? (
    <ListBlock state={state} summary={summary} />
  ) : (
    <AnswerBlock state={state} details={details} />
  );

  return (
    <div
      className="leafcard"
      data-state={state}
      role="region"
      aria-label={S.brainGlobeDetail(label)}
      style={
        {
          '--leafcard-top': `${top.toFixed(2)}px`,
          '--leafcard-height': `${height.toFixed(2)}px`,
        } as CSSProperties
      }
    >
      {/* 1 — the orb the person just pressed, the name the FILE gives it, and
          the way out. The orb carries the node's own gradient so the thing on
          the card is visibly the thing on the stage. */}
      <div className="leafcard-head">
        <span className="leafcard-orb" data-gradient={gradient} data-hollow={leafOrbIsHollow(state) ? 'true' : 'false'} aria-hidden="true" />
        <p className="leafcard-name">{label}</p>
        <button type="button" className="leafcard-close" aria-label={S.leafCloseNamed(label)} onClick={onClose}>
          {CLOSE_MARK}
        </button>
      </div>

      {/* A REAL TAB STOP, because it scrolls. axe's
          `scrollable-region-focusable` (WCAG 2.1.1) is the rule, and the
          reason behind it is the one that matters: a region somebody can only
          reach the bottom of with a pointer has content only pointer users
          can read. The card around it carries the name. */}
      <div className="leafcard-scroll" tabIndex={0}>
        {/* 2 — what the field is FOR. §7.4: absent is a legal state, and the
            card closes the gap rather than printing a placeholder. */}
        {purpose && <p className="leafcard-purpose">{purpose}</p>}

        {/* 3 — the only part that varies. */}
        <div className="leafcard-block" data-dashed={leafBlockIsDashed(state) ? 'true' : 'false'} data-gradient={gradient}>
          {body}
        </div>

        {/* 4 — exactly one, or none. */}
        {chip && <p className="leafcard-chip">{chip}</p>}
      </div>

      {/* 5 — one full-width button, never two. Primary only where the node is
          genuinely empty; a skip gets the same quiet change a filled answer
          gets (O1, core/globe/leafState.ts). */}
      <button
        type="button"
        className={leafActionIsPrimary(state) ? 'leafcard-act is-primary' : 'leafcard-act'}
        onClick={onAct}
      >
        {actionWordFor(state)}
      </button>
    </div>
  );
}
