import type { NodeSummary } from '../flow/nodeSummary';

/**
 * BS-07c (§7.3) — which of the six states a leaf card is in, and what its one
 * action does.
 *
 * §7.3 is a matrix of six rows over two axes: what the node HOLDS (a single
 * answer, or a list of records) and how it is DOING (filled, empty, skipped,
 * incomplete). The card's markup is one shape; this decides which of the six
 * it is wearing, so the component branches on a named state rather than on
 * five booleans that could disagree with each other.
 *
 * ── O1, AS RULED (Adam, 2026-08-28) ───────────────────────────────────────
 *
 * §7.3's matrix gave "Answer, skipped" the same PRIMARY BLUE action as
 * "Answer, empty". That collides head-on with what O3 settled: a skip writes
 * `null`, and `core/recommend/engine.ts` deliberately never re-raises one,
 * because doing so is "the product arguing with a decision somebody already
 * made". A card that says *you skipped this* under a primary **Answer this**
 * is that argument, one surface further along.
 *
 * So `skipped` keeps the hollow ring and the dashed block — the block really
 * is empty, and drawing it full would be the opposite lie — and takes the
 * SECONDARY action a filled answer gets. The difference between "you have not
 * answered this" and "you chose not to" is carried in the words, which is
 * where a difference of that kind belongs.
 *
 * ── NOTHING HERE READS AN ANSWER ──────────────────────────────────────────
 *
 * Counts, a kind, and whether a stamp exists. The same discipline the
 * recommendation engine keeps, for the same reason: the panel does not judge
 * content, and a fold that looked at text would make that promise false.
 */

export type LeafState =
  /** One or more answers, at least one of them real. */
  | 'answer-filled'
  /** No answer at all — never reached, or reached and left. */
  | 'answer-empty'
  /** Asked and passed on. A decision, not a gap. */
  | 'answer-skipped'
  /** Records, all of them complete. */
  | 'list-healthy'
  /** Records, at least one of them unfinished. */
  | 'list-incomplete'
  /** A list node with no records in it yet. */
  | 'list-empty';

/** Whether the card's one action is the screen's primary. */
export function leafActionIsPrimary(state: LeafState): boolean {
  // Only the two genuinely EMPTY states push. A skip does not (O1), and a
  // node that already holds something is offering a change, not a demand.
  return state === 'answer-empty' || state === 'list-empty';
}

/** Whether the orb is drawn solid or as a hollow ring. */
export function leafOrbIsHollow(state: LeafState): boolean {
  return state === 'answer-empty' || state === 'answer-skipped' || state === 'list-empty';
}

/** Whether the value block is dashed and muted rather than tinted and ruled. */
export function leafBlockIsDashed(state: LeafState): boolean {
  return leafOrbIsHollow(state);
}

/**
 * The state, from the summary the globe already holds.
 *
 * `null` is a real input: `nodeSummaryFor` returns nothing for a node holding
 * nothing at all, and that is the empty state rather than an error. Which KIND
 * of empty it is cannot be read from a null summary, so the caller passes the
 * node's own shape — whether it owns a repeatable block — which is a fact
 * about the outline and not about the person.
 */
export function leafStateFor(
  summary: NodeSummary | null,
  ownsRecords: boolean,
): LeafState {
  if (!summary) return ownsRecords ? 'list-empty' : 'answer-empty';

  if (summary.itemKind === 'record') {
    if (summary.items === 0) return 'list-empty';
    // Incomplete is the node's own questions, not a per-item inspection — the
    // hard constraint forbids naming an item anywhere in the brain view, and
    // a count of what is unfinished says the fact without naming anything.
    return summary.answered < summary.total ? 'list-incomplete' : 'list-healthy';
  }

  // An answer node. `items` is the answered count (nodeSummary.ts), so zero
  // answers with something skipped is the skipped state, and zero of both is
  // simply empty.
  if (summary.items > 0) return 'answer-filled';
  return summary.skipped > 0 ? 'answer-skipped' : 'answer-empty';
}
