import type { CSSProperties } from 'react';
import type { NodeSummary } from '../../core/flow/nodeSummary';
import type { Recommendation } from '../../core/recommend/types';
import { recommendationCopy } from './Recommendation';
import { S } from '../strings';
import './NodeSummary.css';

/**
 * V1.5 VB-27 — the floating summary a sub-node shows on hover, on focus and
 * on activation.
 *
 * ── What it is for ────────────────────────────────────────────────────────
 *
 * docs/V1.5-REFINEMENT.md: "Where a secondary node has items, hovering it
 * shows a floating summary: what the node is, how many items, their
 * categories, and — the part that makes this more than a tooltip — a place
 * recommendations attach."
 *
 * So it is four short lines and, when there is one, an offer. It is NOT the
 * split's detail panel drawn smaller: that panel quotes the person's own
 * answers cell by cell (components/BrainGlobe.tsx's `DetailGrid`), and if
 * hovering showed the same thing then hovering and picking would be the same
 * act. This says how much is in here, of what kinds, and how old it is.
 *
 * ── It draws, it decides nothing ──────────────────────────────────────────
 *
 * Every number arrives already folded by core/flow/nodeSummary.ts and every
 * recommendation already ranked by core/recommend/engine.ts. This file turns
 * them into strings from src/panel/strings.ts and lays them out. That split is
 * what lets Home draw the same recommendation as a card with two controls
 * while this draws it as two lines, without either of them owning the copy.
 *
 * ── Nothing in here is interactive, on purpose ────────────────────────────
 *
 * A box that appears on hover and contains a button is a box a person has to
 * chase with the pointer, and a keyboard user reaches it only by tabbing INTO
 * something that was never announced as a stop. So the recommendation is
 * printed here and acted on where it is already actionable — Home's list,
 * which has the action and the decline side by side (components/
 * Recommendation.tsx). That also makes WCAG 1.4.13's three conditions cheap
 * to hold: it is dismissible (Escape), hoverable (the pointer may rest on it),
 * and persistent (nothing times it out).
 *
 * Because it is not interactive it is a `tooltip`, and BrainGlobe.tsx points
 * the sub-node's `aria-describedby` at it while it is open — so a screen
 * reader hears the same summary a sighted person sees, on the same focus, and
 * nothing has to move.
 *
 * It is also transparent to the pointer (`pointer-events: none`, and see
 * NodeSummary.css for why): it covers a third of a stage full of 44px targets,
 * and a card that swallowed their clicks would be a card that broke the globe
 * to describe it. The stage keeps it open while the pointer is inside it
 * instead, which is 1.4.13's "hoverable" without the cost.
 */

export interface NodeSummaryCardProps {
  /** The element id `aria-describedby` on the node points at. */
  id: string;
  summary: NodeSummary;
  /**
   * The one recommendation attached to this node, if any. One, not a list:
   * core/recommend/engine.ts already keeps a single strongest recommendation
   * per node ("one strong one beats five weak ones", VB-28), and a stack of
   * offers on a floating card is a screen the person did not open.
   */
  recommendation?: Recommendation | undefined;
  /** Which half of the stage this sits in — the half the node is NOT in. */
  place: 'top' | 'bottom';
  /**
   * How many pixels there are between the stage's edge and the node, measured
   * by BrainGlobe.tsx from the real geometry of the frame on screen.
   *
   * The card is capped at it, which is what turns "it must not cover the node
   * it describes" from a layout intention into something that cannot happen.
   * The content below is written to fit the smallest band the drawer can
   * produce, and the e2e measures that nothing is really being cut off — a cap
   * is a guarantee about the node, not a licence to hide half a card.
   */
  room: number;
}

/**
 * The age, in the same words the List's rows and the recommendations use.
 *
 * "3 months old", never "not updated in 3 months". The same arithmetic, but
 * one of them is a fact about the file and the other is a sentence about the
 * person — and docs/GUARDRAILS.md rules out the second one everywhere.
 */
function ageLine(summary: NodeSummary): string | null {
  if (summary.ageDays === null || summary.elapsed === null) return null;
  if (summary.ageDays === 0) return S.summaryToday;
  return S.summaryAge(S.agoLabel(summary.elapsed.value, summary.elapsed.unit));
}

export function NodeSummaryCard({ id, summary, recommendation, place, room }: NodeSummaryCardProps) {
  const age = ageLine(summary);
  const count = summary.itemKind === 'record' ? S.summaryNamed(summary.items) : S.summaryAnswers(summary.items);

  /**
   * The metrics line. Counts, and only the ones that add something.
   *
   * "13 of 13 answered" is dropped: the line above already said how much is in
   * here, and a fraction whose halves are equal is the same fact typed twice
   * on a card with room for four lines. A fraction that is NOT equal is a
   * different fact — something in this node was never filled in — and that one
   * is always printed, beside anything that was passed on.
   */
  const facts: string[] = [];
  if (summary.total > 0 && summary.answered !== summary.total) {
    facts.push(S.summaryAnswered(summary.answered, summary.total));
  }
  if (summary.skipped > 0) facts.push(S.sectionSkipped(summary.skipped));

  const copy = recommendation ? recommendationCopy(recommendation) : null;

  return (
    <div
      className="nodesummary"
      id={id}
      role="tooltip"
      data-place={place}
      data-node-id={summary.nodeId}
      style={{ '--nodesummary-room': `${Math.round(room)}px` } as CSSProperties}
    >
      {/* The file's own name for the node. The stage prints the short one
          (core/flow/globeLabels.ts), so this is genuinely the extra
          information rather than the same three words again — and it is why
          the card may sit over the node's LABEL, though never over the node. */}
      <p className="nodesummary-name">{summary.label}</p>
      <p className="nodesummary-count">
        {count}
        {age ? ` · ${age}` : ''}
      </p>

      {summary.categories.length > 0 && (
        /* The distribution. The question it groups by is the list's name
           rather than a line above it: "Who or what is this role for?" is a
           whole spoken sentence, and at 260px it costs two of the four lines
           this card gets while the labels under it — "My employer", "Clients"
           — already say what they are. A screen reader still hears it, as the
           name of the list it belongs to. */
        <ul className="nodesummary-cats" {...(summary.categoryBy ? { 'aria-label': summary.categoryBy } : {})}>
          {summary.categories.map((category) => (
            <li className="nodesummary-cat" key={category.label}>
              {S.summaryCategory(category.label, category.count)}
            </li>
          ))}
          {summary.categoriesHidden > 0 && (
            <li className="nodesummary-cat" data-more="true">
              {S.summaryCategoriesMore(summary.categoriesHidden)}
            </li>
          )}
        </ul>
      )}

      {facts.length > 0 && <p className="nodesummary-metrics">{facts.join(' · ')}</p>}

      {copy && recommendation && (
        /* VB-27's "a place recommendations attach". Printed, not offered:
           what would help and why, in the words core/recommend already has,
           with the action and the decline where they can be pressed. */
        <div className="nodesummary-rec" data-rec-kind={recommendation.kind} data-rec-id={recommendation.id}>
          <p className="nodesummary-rec-label">{S.recsLabel}</p>
          <p className="nodesummary-rec-headline">{copy.headline}</p>
          <p className="nodesummary-rec-why">{copy.why}</p>
        </div>
      )}
    </div>
  );
}
