import { S } from '../strings';
import './FlowProgress.css';

export interface FlowProgressProps {
  /** The current module's own title — "Orientation", "How I Communicate".
   * The only text this component renders. */
  title: string;
  /** 1-based index of the question on screen, across the whole flow.
   * Computed by the caller (core/flow/runner's `topLevelIndex`) — this
   * component derives nothing and stores nothing. */
  current: number;
  /** Total top-level questions in the flow (`questionCount`). */
  total: number;
}

/**
 * V1.1 VB-02 — what sits where the "Question 12 of 38 · About Me" breadcrumb
 * used to. The module's own title, and a slim bar underneath it.
 *
 * Decisions, all deliberate:
 *
 * - **No number is printed.** A running count of questions left is a number
 *   people bargain with, not one that helps them answer the question in front
 *   of them. The bar says "some way in" without inviting arithmetic.
 *
 * - **The number is still there for assistive tech.** Removing a number
 *   visually is a design choice; losing it for a screen reader is a bug. So
 *   this is a real `role="progressbar"` carrying `aria-valuenow` /
 *   `aria-valuemin` / `aria-valuemax` and an `aria-valuetext` of
 *   "Question {n} of {total}" — the approved copy in docs/V1.1-COPY-DRAFT.md,
 *   which is explicitly never shown on screen.
 *
 * - **Not the `Meter` component.** Meter is Home's macro four-gate progress
 *   (Name · Repeat · Act · Share) — four segments, a headline percentage, and
 *   its own labels. That is a different quantity with a different meaning, and
 *   sharing one component between them would quietly imply they are the same
 *   measure.
 *
 * - **No per-module colour.** The palette is load-bearing elsewhere
 *   (`--primary` = act, `--violet` = AI, `--amber` = drift, `--green` = done).
 *   Spending one of those on decoration blurs a distinction the rest of the
 *   product leans on, so the fill is the neutral `--ink-3`. "Thematic" here
 *   means the module's own title, not a colour per module.
 *
 * Structure follows `Meter`: the wrapper *is* the progressbar and everything
 * visible inside it is `aria-hidden`, so the title is announced once as the
 * bar's name rather than twice — once as a paragraph and again as a label.
 */
export function FlowProgress({ title, current, total }: FlowProgressProps) {
  const pct = total > 0 ? Math.min(100, Math.max(0, (current / total) * 100)) : 0;
  const valueText = S.questionOfSr(current, total);

  return (
    <div
      className="flowprogress"
      role="progressbar"
      // Every module in the shipped data has a title, so the `||` is never
      // reached in practice. It exists because a progressbar with no
      // accessible name is unusable, and "unusable" is not an acceptable
      // failure mode for a missing string (docs/GUARDRAILS.md: degrade, never
      // break).
      aria-label={title || valueText}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={current}
      aria-valuetext={valueText}
    >
      <p className="flowprogress-title" aria-hidden="true">
        {title}
      </p>
      <div className="flowprogress-track" aria-hidden="true">
        {/* Width is set inline because it is data, not design — the one
            value on this element that changes per question. */}
        <span className="flowprogress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
