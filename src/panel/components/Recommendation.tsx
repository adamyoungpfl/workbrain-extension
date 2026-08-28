import type { Recommendation } from '../../core/recommend/types';
import { S } from '../strings';
import './Recommendation.css';

/**
 * V1.5 VB-28 — a recommendation, in words and on screen.
 *
 * ── The split ─────────────────────────────────────────────────────────────
 *
 * `core/recommend` decides WHAT to recommend and in what order; this decides
 * how it reads and how it looks. Nothing here derives anything: it is handed
 * a `Recommendation` and turns it into three strings from src/panel/strings.ts
 * plus two controls. That is what lets Home draw one of these as a card and
 * VB-27's node summary draw the same one as a line, without either of them
 * owning the copy.
 *
 * ── Two controls, and the second one is the point ─────────────────────────
 *
 * A recommendation is an OFFER (VB-28's third constraint). An offer you
 * cannot decline is a demand, so every one of these carries a hide control
 * beside its action — not buried, not behind a menu, and never behind a
 * confirmation, which docs/GUARDRAILS.md rules out anyway. Hiding writes the
 * one thing this feature persists; see core/recommend/dismissals.ts.
 *
 * `RecommendationHide` is that control, shared by the card on Home and by
 * every row, so declining looks and reads the same wherever it is offered.
 *
 * ── Nothing is distinguished by colour alone ──────────────────────────────
 *
 * The row carries its meaning in words: a headline saying what would help and
 * a second line naming exactly what pressing it does. The chevron and the
 * cross are shapes, not hues. There is no severity colour anywhere — a
 * recommendation is never an error, and colouring one amber would put it in
 * the same visual language as the drift banner without being the same thing.
 */

export interface RecommendationCopy {
  /** What would help. */
  headline: string;
  /** Why — a count or a date, never a judgement. */
  why: string;
  /** The button. A verb the person would say, naming what it opens. */
  action: string;
}

/**
 * The one place a recommendation becomes English.
 *
 * Exhaustive over `Recommendation['kind']` by construction — the switch has
 * no default, so a new kind in core/ is a type error here rather than a
 * silently blank card.
 */
export function recommendationCopy(rec: Recommendation): RecommendationCopy {
  switch (rec.kind) {
    case 'role-stale':
      // R1-12's approved words, unchanged. See strings.ts.
      return {
        headline: S.driftHeading(1),
        why: S.driftBecauseRole(rec.role, S.agoLabel(rec.elapsed.value, rec.elapsed.unit)),
        action: S.driftAction(1),
      };
    case 'section-stale':
      return {
        headline: S.recStaleHeading(rec.section),
        why: S.recStaleWhy(S.agoLabel(rec.elapsed.value, rec.elapsed.unit)),
        action: S.recOpenSection(rec.section),
      };
    case 'section-empty':
      return {
        headline: S.recEmptyHeading(rec.section),
        why: S.recEmptyWhy(rec.questions),
        action: S.recOpenSection(rec.section),
      };
    case 'initiative-no-success':
      return {
        headline: S.recSuccessHeading(rec.initiative),
        why: S.recSuccessWhy,
        action: S.driftAction(1),
      };
  }
}

const CHEVRON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CROSS = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
  </svg>
);

export interface RecommendationHideProps {
  rec: Recommendation;
  onHide: (rec: Recommendation) => void;
  className?: string;
}

/**
 * The decline. ONE affordance for it in the whole product, shared by the card
 * and the rows.
 *
 * It is an icon and not a "Hide this" button because the label beside it is
 * variable-length copy — "Open Vocabulary & Knowledge" is twenty-seven
 * characters, and at 400px a text pair wraps to two lines and leaves the
 * decline floating under the accept, looking like a second, weaker action
 * rather than a way out. A cross in the corner is the same size target, the
 * same meaning, and the same shape wherever a recommendation appears.
 *
 * Never unlabelled: `recHideNamed` names the recommendation it hides, so
 * three of these in a list are three distinct controls to a screen reader
 * rather than three identical "Hide" buttons.
 */
export function RecommendationHide({ rec, onHide, className }: RecommendationHideProps) {
  return (
    <button
      type="button"
      className={['rec-hide', className].filter(Boolean).join(' ')}
      onClick={() => onHide(rec)}
      aria-label={S.recHideNamed(recommendationCopy(rec).headline)}
    >
      {CROSS}
    </button>
  );
}

export interface RecommendationRowProps {
  rec: Recommendation;
  onAct: (rec: Recommendation) => void;
  onHide: (rec: Recommendation) => void;
}

/**
 * The quieter form: the ones after the first.
 *
 * Two real buttons side by side rather than one row with a nested control —
 * a button inside a button is invalid HTML and unreachable by keyboard. Both
 * clear the 44px floor (docs/GUARDRAILS.md); the hide control is square so it
 * clears it in both directions rather than only in height.
 *
 * The second line is the action, printed rather than hidden in a tooltip, so
 * the row says what it does before it is pressed. It is inside the button, so
 * it is part of the accessible name: "Open My World" is announced with the
 * headline, not instead of it.
 */
export function RecommendationRow({ rec, onAct, onHide }: RecommendationRowProps) {
  const copy = recommendationCopy(rec);
  return (
    <li className="rec-row" data-rec-kind={rec.kind} data-rec-id={rec.id}>
      <button type="button" className="rec-row-act" onClick={() => onAct(rec)}>
        <span className="rec-row-text">
          <span className="rec-row-headline">{copy.headline}</span>
          <span className="rec-row-action">{copy.action}</span>
        </span>
        <span className="rec-row-chevron">{CHEVRON}</span>
      </button>
      <RecommendationHide rec={rec} onHide={onHide} className="rec-row-hide" />
    </li>
  );
}
