import type { NodeSummary } from '../flow/nodeSummary';
import type { SectionHealth } from '../freshness/sectionHealth';
import type { OutlineNodeState } from '../flow/outline';

/**
 * BS-07b (§7.1) — the chip beside a node's name on the stage.
 *
 * §7.1, verbatim: "add a count chip beside the name — a number when the node
 * holds a list, a state word when there is something to say ('due', 'not
 * yet', reusing the List's own wording), dashed when nothing is answered,
 * never two chips."
 *
 * ── NEVER TWO CHIPS IS THE WHOLE SHAPE OF THIS FILE ───────────────────────
 *
 * A union with one member, or nothing. The rule cannot be broken by a caller
 * because there is no way to express two — which is the same reason
 * `leafState` is a named state rather than five booleans, and the same reason
 * the leaf card's own chip is "exactly one, or none".
 *
 * ── THE WORDS ARE THE LIST'S, NOT NEW ONES ────────────────────────────────
 *
 * "Due" and "Not yet" are `sectionStateDue` and `fileTreeStateUntouched`,
 * already printed on every row of the drawer's list. Brain and List are two
 * views of one file; a section that reads "Due" in the list must not read
 * anything else on its own node. This file names the STATE and the panel
 * resolves the word, so neither can drift from the other.
 *
 * ── AND "NOT YET" COMES FROM THE NODE'S OWN STATE, NOT FROM HEALTH ────────
 *
 * A contradiction found by building this: `outlineNodeState` and
 * `SectionHealth` are two folds with two vocabularies, and for a PARENT node
 * they can disagree — `2. About Me` announces itself "About Me — Written"
 * from the first while the second reported nothing answered. A node that says
 * "Written" out loud and wears a chip reading "Not yet" is one object telling
 * a person two different things.
 *
 * So "not yet" is read from `OutlineNodeState`, which is what the node's own
 * accessible name is built from (BrainGlobe.tsx's `stateWord`). The two
 * cannot disagree because they are now the same input. "Due" still comes from
 * health, because freshness is a fact the outline state does not carry — and
 * it is not a contradiction: a node can be written AND overdue.
 *
 * ── WHAT DECIDED THE ORDER ────────────────────────────────────────────────
 *
 * A count beats a state word, because a number is the more specific fact and
 * §7.1 asks for it first. "Due" beats "not yet", because a section that has
 * aged past its own clock is the one somebody would act on. And a node with
 * nothing to say gets nothing — an empty chip on every quiet node would be
 * ten pieces of furniture on a 260px stage.
 */

export type NodeChip =
  /** The node holds a list, and this is how many things are in it. */
  | { kind: 'count'; count: number }
  /** Something worth saying, in the List's own word. */
  | { kind: 'word'; state: 'due' | 'not-yet' };

/**
 * Whether the chip is drawn dashed: nothing in this node is answered.
 *
 * Separate from the chip's CONTENT because §7.1 lists them separately —
 * "a state word when there is something to say …, dashed when nothing is
 * answered" — and they genuinely are two facts. A "not yet" chip is dashed;
 * so is an empty list's count of zero, if one is ever shown.
 */
export function nodeChipIsDashed(state: OutlineNodeState): boolean {
  return state === 'untouched';
}

/**
 * The one chip a node wears, or `null` for a node with nothing to say.
 *
 * THREE INPUTS, EACH FROM THE PLACE THAT OWNS IT. The count comes from the
 * summary the globe already draws its hover card from; the state comes from
 * the SAME `SectionHealth` the drawer's list rows print, so "Due" on a node
 * and "Due" on a row cannot become two different judgements; and `ownsList`
 * is the outline's own shape (`core/flow/outline.ts`'s `listNodeIds`), which
 * is the one thing neither of the other two can say — a node holding nothing
 * cannot tell you whether it is an empty list or an empty answer.
 */
export function nodeChipFor(
  summary: NodeSummary | null,
  health: SectionHealth | undefined,
  state: OutlineNodeState,
  ownsList: boolean,
): NodeChip | null {
  // A list says how many. Zero is still a number worth printing on a node
  // built for several — that is exactly what "not yet" cannot tell you.
  if (ownsList) {
    const count = summary && summary.itemKind === 'record' ? summary.items : 0;
    return { kind: 'count', count };
  }

  // Freshness first: a node can be written AND overdue, and overdue is the
  // one somebody would act on.
  if (health?.state === 'due') return { kind: 'word', state: 'due' };

  // "Not yet" from the SAME state the node's accessible name is built from,
  // so the picture and the announcement cannot contradict each other.
  if (state === 'untouched') return { kind: 'word', state: 'not-yet' };

  // Written, current, and not a list. There is nothing a chip could add that
  // the node's own brightness does not already say.
  return null;
}
