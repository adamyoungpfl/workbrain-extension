import type { FileOutlineNode, FlowContext, Module } from '../../schema/flow.types';
import type { Answers } from '../../schema/storage.types';
import { buildFlowLookups, keyOf, resolvePhrase } from '../files/lookups';
import { splitSectionLabel } from '../flow/sectionLabel';
import { halfLifeFor } from './halfLives';
import { daysSince, isDue } from './clocks';

/**
 * V3.0 pass 7 — THE MAINTENANCE QUEUE (Adam, 2026-09-02): "just preview of
 * the next prompt they need to complete or update… This will feature the
 * actual Next Move oldest first, but can then expand to see them all…
 * Like when Word searches for grammar and cover the whole doc starting
 * from wherever you are. Once we start on a stale or incomplete record we
 * go to the next open or stale after."
 *
 * One fold, two kinds of debt, FILE ORDER throughout:
 *
 *   open  — a question with no entry at all. The build actions.
 *   stale — an answered question whose answer has outlived its own
 *           section's half-life (halfLives.ts, the same clocks the
 *           section-health fold reads). The confirm-or-update actions.
 *
 * The order never re-ranks: it is the document's own order, which is what
 * makes the Word-style sweep coherent — finish one item and the next is
 * simply the next line of the doc that still needs a hand. What "oldest
 * first" means for the FEATURED pick is `featuredMove` below, exported so
 * Home never invents the policy inline.
 *
 * Pure, injected `now`, nothing stored — the freshness family's own laws.
 * Skips what jumpTargets skips (intros; repeatable fields, whose door is
 * the multiples screen) for the same reasons it skips them.
 */
export interface MaintenanceItem {
  questionId: string;
  /** The question, worded as the interview asks it. */
  question: string;
  /** The section's name, numeral stripped — "Roles", "My World". */
  section: string;
  kind: 'open' | 'stale';
  /** Stale only: when the answer landed, and how old it is now. */
  answeredAt?: string;
  ageDays?: number;
}

export function maintenanceQueue(
  modules: Module[],
  outline: readonly FileOutlineNode[],
  answers: Pick<Answers, 'values' | 'answeredAt'>,
  now: Date,
): MaintenanceItem[] {
  const lookups = buildFlowLookups(modules);
  const ctx: FlowContext = { answers: answers.values, repeatables: {} };
  const out: MaintenanceItem[] = [];

  const walk = (nodes: readonly FileOutlineNode[]) => {
    for (const node of nodes) {
      const section = splitSectionLabel(node.label).title;
      for (const qid of node.questionIds) {
        if (lookups.repeatableBlockForQuestionId.has(qid)) continue;
        const step = lookups.stepsById.get(qid);
        if (!step || step.kind === 'intro') continue;
        const key = keyOf(step);
        if (!(key in answers.values)) {
          out.push({ questionId: qid, question: resolvePhrase(step.q, ctx), section, kind: 'open' });
          continue;
        }
        const at = answers.answeredAt[key];
        if (at && isDue(at, now, halfLifeFor(node.id))) {
          out.push({
            questionId: qid,
            question: resolvePhrase(step.q, ctx),
            section,
            kind: 'stale',
            answeredAt: at,
            ageDays: daysSince(at, now),
          });
        }
      }
      if (node.children) walk(node.children);
    }
  };
  walk(outline);
  return out;
}

/**
 * The one the section leads with. Build actions outrank maintenance
 * (Adam: confirms "go as well WHEN there are no build actions required"),
 * and within each kind "oldest first" means what it can mean: the first
 * open item in file order is the longest-outstanding build step, and the
 * oldest stale answer is the one that has waited longest for a confirm.
 */
export function featuredMove(queue: readonly MaintenanceItem[]): MaintenanceItem | null {
  const open = queue.find((item) => item.kind === 'open');
  if (open) return open;
  let oldest: MaintenanceItem | null = null;
  for (const item of queue) {
    if (item.kind !== 'stale' || !item.answeredAt) continue;
    if (!oldest || item.answeredAt < oldest.answeredAt!) oldest = item;
  }
  return oldest;
}

/**
 * The sweep's next stop after finishing `questionId`: the next item AFTER
 * it in file order, wrapping past the end — Word's own gesture, "cover
 * the whole doc starting from wherever you are". Null when the queue
 * holds nothing else.
 */
export function nextAfter(queue: readonly MaintenanceItem[], questionId: string): MaintenanceItem | null {
  if (!queue.length) return null;
  const at = queue.findIndex((item) => item.questionId === questionId);
  const rest = at === -1 ? queue : [...queue.slice(at + 1), ...queue.slice(0, at)];
  return rest[0] ?? null;
}
