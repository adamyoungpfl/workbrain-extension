import type { FileOutlineNode, Module } from '../../schema/flow.types';
import type { Answers } from '../../schema/storage.types';
import { currentQuestionIdFor, outlineNodeState } from '../flow/outline';
import { findPosition } from '../flow/runner';
import { splitSectionLabel } from '../flow/sectionLabel';

const NONE: ReadonlySet<string> = new Set();

/**
 * R-08 (Adam, 2026-08-28, decision D1) — WHICH SECTION THEY ARE IN, for the
 * Context card's `Current: [ ]`.
 *
 * "Expand the status from 'Current' to 'Current: [the section you're in]'."
 *
 * ── IT IS THE SAME ANSWER THE INTERVIEW WOULD GIVE ────────────────────────
 *
 * `findPosition` is the runner's own "where does this file resume", and it is
 * what actually happens when somebody presses the card. `currentQuestionIdFor`
 * and `outlineNodeState` are the pair the drawer's tree already uses to decide
 * which row is the standing one. So the card names the section the interview
 * would open on — not a section this file worked out for itself.
 *
 * That matters more than it looks. A card that said "Current: My World" and
 * then opened on Roles would be a small lie told at the exact moment somebody
 * decided to trust the product, and the only way to be sure it never happens
 * is to ask the same function.
 *
 * ── THE NUMERAL COMES OFF ─────────────────────────────────────────────────
 *
 * Outline labels ship as "3. My World" because the file prints them that way.
 * "Current: 3. My World" reads as a position in a list nobody has seen; the
 * title alone reads as a place. `splitSectionLabel` is the same split the
 * breadcrumb and the leaf card already make.
 *
 * Returns `null` when the flow is not standing in any section — a finished
 * file, an empty one, or a position between modules. The panel then says
 * plain "Current", which is what it said before this existed.
 *
 * NOTHING IS STORED: every input is recomputed per render, and `findPosition`
 * derives rather than reads (docs/ARCHITECTURE.md).
 */
export function currentSectionTitle(
  modules: Module[],
  outline: readonly FileOutlineNode[],
  answers: Answers,
): string | null {
  const questionId = currentQuestionIdFor(findPosition(modules, answers, NONE));
  if (!questionId) return null;

  // Depth-first, and the DEEPEST match wins: a sub-section is inside its
  // parent, so both report `current` and the child is the more useful answer —
  // "Current: Roles" beats "Current: My World" when the question is a role's.
  const walk = (nodes: readonly FileOutlineNode[]): string | null => {
    for (const node of nodes) {
      if (outlineNodeState(node, answers.values, questionId) !== 'current') continue;
      return (node.children && walk(node.children)) ?? splitSectionLabel(node.label).title;
    }
    return null;
  };
  return walk(outline);
}
