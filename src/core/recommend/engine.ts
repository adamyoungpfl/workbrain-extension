import type { AnswerValue, FileOutlineNode, Module } from '../../schema/flow.types';
import type { Answers, Dismissals } from '../../schema/storage.types';
import { contextModules, contextOutline } from '../flow/flow';
import { ROLES_BLOCK_ID, ROLE_DURABILITY_KEY, computeNextMove } from '../freshness/nextMove';
import type { SectionHealth } from '../freshness/sectionHealth';
import { sectionHealthMap } from '../freshness/sectionHealth';
import { activeDismissals, withoutDismissed } from './dismissals';
import type { Recommendation } from './types';
import { RECOMMENDATION_WEIGHT, stalenessUrgency } from './weights';

/**
 * V1.5 VB-28 — the recommendations engine. Structural half only.
 *
 * `wb:answers` plus a clock in, a ranked list of concrete next actions out.
 * Pure: no chrome.*, no DOM, no network, no AI. It runs on a plane, it runs
 * in a unit test, and it runs on every render because there is nothing to
 * cache — see ./dismissals.ts for the single, deliberate exception.
 *
 * ── THE SPLIT THIS FILE IS ON THE RIGHT SIDE OF ───────────────────────────
 *
 * docs/BACKLOG-file-quality-and-intake.md divides the work by who can honestly
 * judge it, and docs/V1.5-REFINEMENT.md's VB-28 repeats it verbatim:
 *
 *   STRUCTURAL — sections empty, questions passed on, one entity where the
 *   section is built for several, a section past its half-life, an initiative
 *   with no success criteria — the panel, locally. Pure derivation over
 *   answers. No content judgment.
 *
 *   QUALITATIVE — is this answer specific enough, does it actually change
 *   output — the person's own AI, via the same copy/paste hand-off the proof
 *   loop uses.
 *
 * NOTHING IN THIS FILE READS THE TEXT OF AN ANSWER. It reads whether a key is
 * present, whether it is `null`, how many records a block holds, and when a
 * stamp was written. Names are carried through to the copy so a recommendation
 * can say "the Atlas migration" instead of "an initiative", and that is the
 * only contact this engine has with what anybody actually wrote.
 * src/panel/strings.ts promises "The panel never reads or scores it", and a
 * rule here that graded a sentence would make that line false.
 *
 * ── IT IS SILENT UNTIL THE FILE IS BUILT ──────────────────────────────────
 *
 * `recommend` returns nothing at all while the interview still has questions
 * waiting. That is the single most important line in this file for
 * docs/GUARDRAILS.md's "no nudges framed as guilt".
 *
 * Somebody twelve questions in already has a next move — the next question —
 * and Home already offers it. Listing the nine sections they have not reached
 * yet would restate their position as a list of failures, which is exactly
 * the sentence VB-28 rules out ("never frames absence as failure"). A section
 * they have not got to is not a gap; it is the road ahead.
 *
 * "Still has questions waiting" is `left > 0` anywhere in the outline —
 * `sectionHealth`'s own honest denominator, which already knows that a gate
 * answered "no" removes its block and that an intro beat is not a question.
 * It is derived, so it needs no session state and no flag: nothing here has
 * to know about `declinedBlocks` or which screen anybody is on.
 *
 * ── ONE FACT, ONE RECOMMENDATION ──────────────────────────────────────────
 *
 * Two rules can see the same trouble from different angles. The engine keeps
 * ONE recommendation per outline node (the highest-ranked), and drops a
 * parent's when a child of it already has one — a person told "2.1 Roles is
 * out of date" does not also need "2. About Me is out of date". "One strong
 * recommendation beats five weak ones" (VB-28) is a ranking instruction, and
 * this is the half of it that happens before ranking.
 */

/** Source block ids, from the ported interview (core/flow/source.ts). Named
 * here rather than typed inline for the same reason nextMove.ts names its
 * own: a silent rename in the ported data should break a test, not a rule. */
export const ENTITIES_BLOCK_ID = 'entities';
export const ENTITIES_GATE_ID = 'entities_gate';
export const ENTITY_NAME_ID = 'entity_name';
export const INITIATIVES_BLOCK_ID = 'initiatives_records';
export const INITIATIVES_GATE_ID = 'initiatives_gate';
export const INITIATIVE_NAME_ID = 'initiative_name';
export const INITIATIVE_SUCCESS_ID = 'initiative_success';
export const ROLES_NODE_ID = 'sec2-1';
export const ENTITIES_NODE_ID = 'sec3';
export const INITIATIVES_NODE_ID = 'sec4';

/**
 * How many named things a section built for several is thin at.
 *
 * ONE, not two or three. The copy that goes with this ("most people name
 * three or four here") is help; a rule that fired at three would turn the
 * same sentence into a target, and a target is the gamification
 * docs/GUARDRAILS.md rules out. One is the only count where "there is a whole
 * shape of answer you have not used yet" is a structural observation rather
 * than an opinion about how much is enough.
 */
export const THIN_AT_OR_BELOW = 1;

/** "2.3 Boundaries" -> "Boundaries". Same convention core/flow/globeLabels.ts
 * uses on the same labels and for the same reason — the number is the file's
 * ordering, and a sentence that says "you wrote 2.3 Boundaries five months
 * ago" reads like a filing system talking. Kept local rather than shared so
 * the globe's short-label table and this copy stay free to diverge. */
const LEADING_NUMBER = /^\d+(?:\.\d+)?\.?\s+/;
const plainName = (label: string) => label.replace(LEADING_NUMBER, '');

export interface RecommendInput {
  answers: Answers;
  /** Injected, never `new Date()` inside — the discipline core/freshness
   * holds itself to, so every boundary in the tests is repeatable. */
  now: Date;
  /** Absent means nothing has been hidden. */
  dismissals?: Dismissals | undefined;
  outline?: FileOutlineNode[];
  modules?: Module[];
}

/** Every node in the outline, flat, with the id of its parent. One walk, so a
 * rule can ask "is this a child of something" without re-walking. */
interface FlatNode {
  node: FileOutlineNode;
  parentId: string | null;
  /** File order — the tie-break when two recommendations rank equal. */
  order: number;
}

function flatten(outline: readonly FileOutlineNode[]): FlatNode[] {
  const flat: FlatNode[] = [];
  const walk = (nodes: readonly FileOutlineNode[], parentId: string | null) => {
    for (const node of nodes) {
      flat.push({ node, parentId, order: flat.length });
      if (node.children) walk(node.children, node.id);
    }
  };
  walk(outline, null);
  return flat;
}

function makeId(kind: string, key: string): string {
  return `${kind}:${key}`;
}

/** A recorded answer that is `null` — asked, and passed on (runner.ts's
 * `applySkip`). Absent is a different thing and means the flow never got
 * there, which the "silent until built" gate has already ruled out. */
function passedOn(value: AnswerValue | undefined, present: boolean): boolean {
  return present && value === null;
}

function textOf(value: AnswerValue | undefined): string {
  return typeof value === 'string' ? value : '';
}

// ── the rules ──────────────────────────────────────────────────────────────

/**
 * A role marked "current" whose answer has aged past the roles clock.
 *
 * Delegates to `computeNextMove` rather than re-deriving it, so R1-12's card
 * and this engine can never disagree about the same role — the same reason
 * halfLives.ts pins 2.1 Roles to `DUE_AFTER_DAYS` instead of retyping 182.
 * This is what lets Home stop running two "what to do next" derivations and
 * render one list (see the surface's own comment in Home.tsx).
 */
function roleStale(answers: Answers, now: Date): Recommendation[] {
  const move = computeNextMove(answers, now);
  if (move.kind !== 'due') return [];
  return move.items.map((item) => ({
    id: makeId('role-stale', String(item.recordIndex)),
    kind: 'role-stale' as const,
    nodeId: ROLES_NODE_ID,
    rank: RECOMMENDATION_WEIGHT['role-stale'],
    target: {
      in: 'repeatable' as const,
      blockId: ROLES_BLOCK_ID,
      recordIndex: item.recordIndex,
      questionId: ROLE_DURABILITY_KEY,
    },
    role: item.role,
    elapsed: item.elapsed,
  }));
}

/**
 * A section where NOTHING has been touched inside its own half-life.
 *
 * Deliberately the section's most recent stamp, not its oldest. "The newest
 * thing in My World is five months old" is a fact about the whole section and
 * is true as stated; ranking on the oldest answer would flag a section
 * somebody edited yesterday because one line in it is old, which is how a
 * freshness feature teaches people to ignore it.
 *
 * It also means a parent and its children agree by construction: 2. About Me
 * can only be stale when everything under it is, which is when the parent's
 * own sentence is worth saying.
 */
function sectionStale(flat: FlatNode[], health: Record<string, SectionHealth>): Recommendation[] {
  const out: Recommendation[] = [];
  for (const { node } of flat) {
    const h = health[node.id];
    if (!h || h.ageDays === null || h.elapsed === null) continue;
    if (h.answered === 0) continue; // nothing in it to be out of date
    if (h.ageDays < h.halfLifeDays) continue;
    const first = node.questionIds[0];
    if (!first) continue;
    out.push({
      id: makeId('section-stale', node.id),
      kind: 'section-stale',
      nodeId: node.id,
      rank: RECOMMENDATION_WEIGHT['section-stale'] + stalenessUrgency(h.ageDays, h.halfLifeDays),
      target: { in: 'top', questionId: first },
      section: plainName(node.label),
      elapsed: h.elapsed,
    });
  }
  return out;
}

/**
 * A section every question of which was passed on.
 *
 * EVERY question, not some. A single skip is a considered answer — "left
 * unanswered on purpose" is an answer (docs/ARCHITECTURE.md) — and re-raising
 * it one at a time would be the product arguing with a decision somebody
 * already made. A whole section blank is a different observation: a shape of
 * answer the file has no example of at all.
 *
 * Offered once per section, and hideable forever, which is the difference
 * between an offer and a nag.
 */
function sectionEmpty(flat: FlatNode[], health: Record<string, SectionHealth>): Recommendation[] {
  const out: Recommendation[] = [];
  for (const { node } of flat) {
    const h = health[node.id];
    if (!h || h.total === 0) continue;
    if (h.answered > 0 || h.skipped !== h.total) continue;
    const first = node.questionIds[0];
    if (!first) continue;
    out.push({
      id: makeId('section-empty', node.id),
      kind: 'section-empty',
      nodeId: node.id,
      rank: RECOMMENDATION_WEIGHT['section-empty'],
      target: { in: 'top', questionId: first },
      section: plainName(node.label),
      questions: h.total,
    });
  }
  return out;
}

/**
 * A named initiative whose "what does success look like" was passed on.
 *
 * The most concrete recommendation the engine can make: they named the thing,
 * the gap is one question, and core/freshness/halfLives.ts already calls
 * success criteria "the single most likely thing in the file to be quietly
 * wrong". One per record, deduped to one per node by `strongestPerNode` —
 * three initiatives with no finish line produce one offer about the first,
 * not three offers stacked on one screen.
 */
function initiativeNoSuccess(answers: Answers): Recommendation[] {
  const records = answers.repeatables[INITIATIVES_BLOCK_ID] ?? [];
  const out: Recommendation[] = [];
  records.forEach((record, recordIndex) => {
    if (!passedOn(record[INITIATIVE_SUCCESS_ID], INITIATIVE_SUCCESS_ID in record)) return;
    const name = textOf(record[INITIATIVE_NAME_ID]);
    if (!name) return; // an unnamed record has nothing to say in a sentence
    out.push({
      id: makeId('initiative-no-success', String(recordIndex)),
      kind: 'initiative-no-success',
      nodeId: INITIATIVES_NODE_ID,
      rank: RECOMMENDATION_WEIGHT['initiative-no-success'],
      target: {
        in: 'repeatable',
        blockId: INITIATIVES_BLOCK_ID,
        recordIndex,
        questionId: INITIATIVE_SUCCESS_ID,
      },
      initiative: name,
    });
  });
  return out;
}

/**
 * One name where the section is built for several.
 *
 * Gated on the person having said yes in the first place. Somebody who
 * answered "no" to "are there specific people, teams, tools or processes
 * worth telling AI about" is not thin — they answered the question, and
 * pushing back on that answer would be the panel overruling them.
 */
function thin(
  answers: Answers,
  gateId: string,
  blockId: string,
  nodeId: string,
  kind: 'entities-thin' | 'initiatives-thin',
  nameQuestionId: string,
): Recommendation[] {
  if (answers.values[gateId] !== 'yes') return [];
  const records = answers.repeatables[blockId] ?? [];
  if (records.length === 0 || records.length > THIN_AT_OR_BELOW) return [];
  return [
    {
      id: makeId(kind, nodeId),
      kind,
      nodeId,
      rank: RECOMMENDATION_WEIGHT[kind],
      // Lands on the first record's name question: the flow's add-another
      // screen is what follows a finished record, so this is the shortest
      // real path to naming a second one.
      target: { in: 'repeatable', blockId, recordIndex: 0, questionId: nameQuestionId },
      named: records.length,
    },
  ];
}

// ── assembly ───────────────────────────────────────────────────────────────

/** Higher rank first; file order breaks a tie, so two equal recommendations
 * come out in the order the person's own file has them, every time. A stable
 * order matters more than it looks: an unstable one would move the top card
 * under somebody's cursor between renders. */
function byRank(flat: FlatNode[]) {
  const order = new Map(flat.map((f) => [f.node.id, f.order]));
  return (a: Recommendation, b: Recommendation): number => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    const ao = order.get(a.nodeId) ?? Number.MAX_SAFE_INTEGER;
    const bo = order.get(b.nodeId) ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
}

/** One per node, then no parent whose child already spoke. See the header. */
function strongestPerNode(sorted: readonly Recommendation[], flat: FlatNode[]): Recommendation[] {
  const parentOf = new Map(flat.map((f) => [f.node.id, f.parentId]));
  const best = new Map<string, Recommendation>();
  for (const rec of sorted) if (!best.has(rec.nodeId)) best.set(rec.nodeId, rec);

  const spoken = new Set(best.keys());
  const hasSpokenDescendant = (nodeId: string): boolean => {
    for (const [id, parentId] of parentOf) {
      if (parentId !== nodeId) continue;
      if (spoken.has(id) || hasSpokenDescendant(id)) return true;
    }
    return false;
  };

  return sorted.filter((rec) => best.get(rec.nodeId) === rec && !hasSpokenDescendant(rec.nodeId));
}

/** True while any question the flow would really ask is still unanswered. */
export function questionsWaiting(
  outline: readonly FileOutlineNode[],
  health: Record<string, SectionHealth>,
): number {
  // Top-level only: `sectionHealth` rolls children into their parent, so
  // adding both would count every sub-section twice.
  return outline.reduce((sum, node) => sum + (health[node.id]?.left ?? 0), 0);
}

/**
 * The whole engine. Ranked, deduped, dismissals applied.
 *
 * Returns `[]` for an empty file (nothing built yet), for a half-built one
 * (the next question is the next move), and — the case worth stating out loud
 * — for a FINISHED, FRESH file. A complete current file has no
 * recommendations, because there is genuinely nothing that would help, and a
 * product that always finds something to suggest is a product nobody believes.
 */
export function recommend(input: RecommendInput): Recommendation[] {
  const {
    answers,
    now,
    dismissals,
    outline = contextOutline,
    modules = contextModules,
  } = input;

  const health = sectionHealthMap(outline, modules, answers, null, now);
  if (questionsWaiting(outline, health) > 0) return [];

  const flat = flatten(outline);
  const candidates = [
    ...roleStale(answers, now),
    ...sectionStale(flat, health),
    ...sectionEmpty(flat, health),
    ...initiativeNoSuccess(answers),
    ...thin(answers, ENTITIES_GATE_ID, ENTITIES_BLOCK_ID, ENTITIES_NODE_ID, 'entities-thin', ENTITY_NAME_ID),
    ...thin(
      answers,
      INITIATIVES_GATE_ID,
      INITIATIVES_BLOCK_ID,
      INITIATIVES_NODE_ID,
      'initiatives-thin',
      INITIATIVE_NAME_ID,
    ),
  ].sort(byRank(flat));

  // ORDER MATTERS, AND IT IS THIS WAY ROUND ON PURPOSE. Deduping first and
  // filtering second means hiding a node's one offer takes that node out of
  // the conversation rather than promoting the next-strongest thing about the
  // same section. Somebody who declines "tell AI what done looks like for
  // Project 1" does not then want "most people list two or three projects"
  // appearing in its place — that is whack-a-mole, and VB-28's third
  // constraint is "dismissible, and QUIET". The same reasoning covers a
  // parent whose child was dismissed: they are the same fact, and re-raising
  // the general form of something already turned down is re-raising it.
  const ranked = strongestPerNode(candidates, flat);
  return withoutDismissed(ranked, activeDismissals(dismissals ?? { dismissed: {} }));
}

/**
 * How many Home shows at once.
 *
 * VB-28 leaves the number open and says why it matters: "one strong
 * recommendation beats five weak ones". Three is the smallest number that is
 * still a list — one card carrying the strongest offer, and two quiet rows so
 * somebody who does not want that one has somewhere else to look rather than
 * a dead end. A fourth row pushes the person's own files below the fold of a
 * 400px panel, which would make a page about their file mostly about our
 * suggestions.
 */
export const HOME_RECOMMENDATION_LIMIT = 3;

/** The top N. Exposed so callers take a few strong ones rather than dumping
 * the list — see the constant above. */
export function topRecommendations(
  recommendations: readonly Recommendation[],
  limit: number = HOME_RECOMMENDATION_LIMIT,
): Recommendation[] {
  return recommendations.slice(0, Math.max(0, limit));
}

/**
 * Grouped by the outline node they belong to, order preserved.
 *
 * VB-27's node summary consumes exactly this: hovering "3. My World" shows
 * what that node holds plus any recommendation attached to it. Same engine,
 * same ranking, same ids — so hiding one in the summary hides it on Home.
 */
export function recommendationsByNode(
  recommendations: readonly Recommendation[],
): Record<string, Recommendation[]> {
  const out: Record<string, Recommendation[]> = {};
  for (const rec of recommendations) (out[rec.nodeId] ??= []).push(rec);
  return out;
}

/** Just this node's, for a caller that only has one node in hand. */
export function recommendationsForNode(
  recommendations: readonly Recommendation[],
  nodeId: string,
): Recommendation[] {
  return recommendations.filter((rec) => rec.nodeId === nodeId);
}
