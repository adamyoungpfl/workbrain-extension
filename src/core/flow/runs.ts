import type { Module, RepeatableBlock, Step } from '../../schema/flow.types';

/**
 * BS-05a (§5) — RUNS OF FIVE.
 *
 * V1.1 VB-02 decided the interview prints no count, and the reasoning holds
 * for the number it was about: "question 12 of 38" invites bargaining,
 * because 38 is far away. Five is not. So the pace a person feels is a short
 * run they can see the end of, and the global total is still never printed
 * (Adam's D1: no digit at all — the panel's own numbers are spelled out).
 *
 * ── A RUN IS BOUNDED BY ITS MODULE (Adam's D1) ────────────────────────────
 *
 * Runs never cross a section boundary. The alternative — strict fives that
 * span modules — gives an even pace and a payoff card that cannot say
 * "Initiatives is lit up", because two sections are half-lit when it fires.
 * A run boundary is therefore always a real section boundary, which is what
 * makes the card able to name what just finished.
 *
 * The last run of a module takes the remainder: seven questions are 5 + 2,
 * eight are 5 + 3. The one exception is a remainder of exactly one, which is
 * merged into the run before it — a payoff card after a single question is
 * ceremony, not reward. No shipped module hits that case today; the rule is
 * here so that authoring one later does not produce a run of one silently.
 *
 * ── WHAT COUNTS AS A QUESTION ─────────────────────────────────────────────
 *
 * Askable nodes only. `kind: 'intro'` is a slide — the module transitions
 * and V2.5 VB-114's tour — and a slide is something a person reads, not
 * something they answer. Counting them would put run boundaries inside the
 * tour and would make Orientation, which is four real questions wrapped in
 * four slides, look like eight.
 *
 * A repeatable BLOCK counts as one, the same unit `topLevelIndex` has always
 * counted (core/flow/runner.ts). What happens inside it is its own loop.
 */

/** The target length. The last run of a module may be shorter. */
export const RUN_LENGTH = 5;

/**
 * BS-05d — how long a run has to be to earn a full-screen payoff.
 *
 * Adam's D1 consequence, recorded when the run shape was decided: six of
 * Context's eleven modules are two questions long, so a takeover at every
 * boundary would fire eleven-plus times in one file. A reward that arrives
 * every two questions is a tax with a nice face on it. Short runs are paid
 * off by the drawer lighting their section — something the person can
 * already watch happen — and the card is kept for the boundaries that
 * genuinely cost something to reach.
 */
export const RUN_CARD_MIN = 4;

export interface Run {
  moduleId: string;
  /** 0-based, within its own module. */
  index: number;
  /** How many runs this module has. */
  of: number;
  /** The askable nodes in this run, in order. */
  nodeIds: string[];
}

function isAskable(node: Step | RepeatableBlock): boolean {
  return 'fields' in node || node.kind !== 'intro';
}

/** The askable node ids of a module, in order. */
export function askableIds(module: Module): string[] {
  return module.nodes.filter(isAskable).map((node) => node.id);
}

/** How one module divides into runs. */
export function runsIn(module: Module): Run[] {
  const ids = askableIds(module);
  if (ids.length === 0) return [];

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += RUN_LENGTH) chunks.push(ids.slice(i, i + RUN_LENGTH));

  // A trailing run of exactly one is ceremony, not reward — fold it back.
  if (chunks.length > 1 && (chunks[chunks.length - 1] as string[]).length === 1) {
    const tail = chunks.pop() as string[];
    (chunks[chunks.length - 1] as string[]).push(...tail);
  }

  return chunks.map((nodeIds, index) => ({
    moduleId: module.id,
    index,
    of: chunks.length,
    nodeIds,
  }));
}

/** Every run in the flow, in order — the sequence a person walks. */
export function allRuns(modules: Module[]): Run[] {
  return modules.flatMap(runsIn);
}

export interface RunPlace {
  run: Run;
  /** 0-based position of this node within its run. */
  place: number;
}

/** Which run a node belongs to, and where in it. `null` for a node that is
 * not askable — an intro slide has no place in a run, by design. */
export function runOf(modules: Module[], nodeId: string): RunPlace | null {
  for (const run of allRuns(modules)) {
    const place = run.nodeIds.indexOf(nodeId);
    if (place >= 0) return { run, place };
  }
  return null;
}

/**
 * Is this node the last of its run — the moment the payoff card fires.
 *
 * Asked about the node just ANSWERED, not the one about to be asked: the
 * boundary belongs to the end of what was finished, which is what lets the
 * card say a section is lit up.
 */
export function endsRun(modules: Module[], nodeId: string): Run | null {
  const found = runOf(modules, nodeId);
  if (!found) return null;
  return found.place === found.run.nodeIds.length - 1 ? found.run : null;
}

/**
 * How many runs have been completed before this one, across the whole flow.
 * The micro-proof fires at a boundary counted this way (BS-03a) — "the
 * second run boundary" is a fact about the walk, not about one module.
 */
export function runOrdinal(modules: Module[], run: Run): number {
  return allRuns(modules).findIndex((each) => each.moduleId === run.moduleId && each.index === run.index);
}

/**
 * BS-03a — the module whose boundary carries the micro-proof's offer.
 *
 * Adam's P4, revised: the second run boundary (end of About Me) cannot do
 * it, because `entities` and `initiatives_records` are asked in the two
 * modules AFTER it — the ladder in core/proof/microProof.ts could only ever
 * reach its role rung there, and the review's own example ("a note to
 * Priya") was unbuildable. The end of My World is the first boundary at
 * which a person has named somebody.
 *
 * Named here rather than in the panel so the fact lives beside the run
 * machinery it depends on, and so a reordering of the flow fails a test
 * rather than quietly moving the moment.
 */
export const MICRO_PROOF_MODULE = 'my-world';
