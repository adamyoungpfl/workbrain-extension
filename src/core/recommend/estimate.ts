import type { FileOutlineNode } from '../../schema/flow.types';
import { contextModules, contextOutline } from '../flow/flow';
import type { Recommendation } from './types';

/**
 * BS-06 (§6) — how long a recommendation costs, in minutes.
 *
 * §6 promotes the recommendation to the top of Home and asks for a time
 * estimate on the verb: "it is the reason to open the panel on day nine".
 * Somebody deciding whether to press it at 4pm is deciding about their next
 * few minutes, and a button that will not say how many is a button they put
 * off.
 *
 * ── THE NUMBER IS DERIVED, NOT PICKED ─────────────────────────────────────
 *
 * `Module.estimatedMinutes` has been on every module since the interview was
 * ported — a `[low, high]` pair the original spec authored per module, unused
 * by anything until now. `MINUTES_PER_QUESTION` is those pairs divided by the
 * questions the file actually holds, which makes this the interview's own
 * estimate restated at a smaller grain rather than a rate somebody invented.
 *
 * It is a PACE, not a measurement. Nothing here observes how long anybody
 * actually took — that would be exactly the count docs/GUARDRAILS.md rules
 * out ("a number the person typed is data; a number the product observed is
 * telemetry"). This is a fact about the interview, computed from the data it
 * ships with, and it says the same thing on every machine.
 *
 * ── WHY THE LOW END OF THE PAIR ───────────────────────────────────────────
 *
 * The engine is SILENT UNTIL THE FILE IS BUILT — `recommend` returns nothing
 * at all while any question is still waiting, and ./engine.ts explains at
 * length why. So every recommendation that reaches this function is somebody
 * coming BACK to material they already have words for, not somebody meeting a
 * question for the first time. The pair's low end is the interview's own
 * estimate for exactly that person; the high end is for the first pass, which
 * by construction never gets here.
 *
 * ── AND THE TOTAL ROUNDS UP ───────────────────────────────────────────────
 *
 * `Math.ceil`, with a floor of one. Somebody told four minutes who finishes
 * in two has been treated well; somebody told two who is still going at five
 * has been lied to and will not believe the next estimate either. Rounding up
 * is where the slack the low end gave away comes back.
 */

/** Every question id under a node, that node and everything beneath it. */
function countIn(node: FileOutlineNode): number {
  return node.questionIds.length + (node.children ?? []).reduce((sum, c) => sum + countIn(c), 0);
}

/**
 * Minutes per question, from the interview's own per-module estimates.
 *
 * Computed once, at module load, from static data — no answers, no clock, no
 * storage. Exported because a test that asserts a rate it also computed is a
 * test that asserts nothing, and this is the one number the copy leans on.
 */
export const MINUTES_PER_QUESTION: number = (() => {
  const minutes = contextModules.reduce((sum, m) => sum + (m.estimatedMinutes[0] ?? 0), 0);
  const questions = contextOutline.reduce((sum, node) => sum + countIn(node), 0);
  return minutes / Math.max(1, questions);
})();

/** How many questions sit under one outline node. One, if it is not found —
 * a recommendation always names a real node, and a missing one should cost a
 * small honest estimate rather than throw on the screen it is printed on. */
function questionsUnder(nodeId: string): number {
  const walk = (nodes: readonly FileOutlineNode[]): number | null => {
    for (const node of nodes) {
      if (node.id === nodeId) return countIn(node);
      const found = node.children ? walk(node.children) : null;
      if (found !== null) return found;
    }
    return null;
  };
  return walk(contextOutline) ?? 1;
}

/* BS-08 (§8), D8 removed `entities-thin` and `initiatives-thin`, and with
   them the only branches that needed a per-record question count. The nudge
   they carried is now a line on the multiples screen, which costs no minutes
   because it is not an errand. */

/**
 * How many questions acting on this recommendation puts in front of somebody.
 *
 * Exhaustive over `kind` by construction, like `recommendationCopy` — a new
 * kind in the engine is a type error here rather than a silently wrong time.
 * Every branch reads a count the recommendation already carries or a count the
 * ported interview already states; none of them reads an answer.
 */
export function recQuestions(rec: Recommendation): number {
  switch (rec.kind) {
    // A whole section that was never touched. The engine already counted it.
    case 'section-empty':
      return rec.questions;
    // A section past its half-life: the trip is the section, so the estimate
    // is the section. Somebody who only revises two of eight beats the
    // estimate, which is the direction to be wrong in.
    case 'section-stale':
      return questionsUnder(rec.nodeId);
    // One question, named. "Is this still current" and "what does success
    // look like" are each a single field.
    case 'role-stale':
    case 'initiative-no-success':
      return 1;
  }
}

/**
 * Whole minutes to print beside the verb. Never zero — the smallest true
 * thing to say about a single question is "about a minute", and a button
 * offering "0 min" reads as broken rather than as fast.
 */
export function recMinutes(rec: Recommendation): number {
  return Math.max(1, Math.ceil(recQuestions(rec) * MINUTES_PER_QUESTION));
}
