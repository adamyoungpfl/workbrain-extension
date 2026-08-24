import type { FileOutlineNode, Module } from '../../schema/flow.types';
import type { Answers } from '../../schema/storage.types';
import { sectionHealthMap, summariseSectionHealth } from '../freshness/sectionHealth';

/**
 * V1.7 VB-36 — the shelf: which files the work brain holds, and which of them
 * a person can open today.
 *
 * Home used to be "Context.md, plus a pile of actions". VB-36 makes it THE SET
 * OF FILES, one slot each, and Adam's decision of 2026-08-24 is that the two
 * that do not exist yet still appear, LOCKED: they are the path to the Skills
 * interview and the Actions interview, and showing them is what makes
 * Context.md read as step one rather than as the whole product.
 *
 * ── WHY THIS IS IN core/ AND NOT IN Home.tsx ──────────────────────────────
 *
 * Two of the three facts a slot carries are derivations with real edge cases:
 * whether the file before it is FINISHED (a fold over `wb:answers`, below),
 * and which of the two locked lines that makes true. Home's job is to print
 * them. Putting the fold here is CLAUDE.md's one architectural rule, and it is
 * what lets `slots.test.ts` walk the boundary — the moment the last question
 * is answered — without a browser.
 *
 * **NOTHING HERE IS STORED.** Every value is recomputed from `wb:answers` on
 * every render, exactly like `computeNextMove`, `findPosition` and
 * `sectionHealthMap` (docs/ARCHITECTURE.md, "nothing derived is stored"). A
 * reopen re-derives the whole shelf; there is no "which files are unlocked"
 * key anywhere, and there must never be one — an unlock flag could disagree
 * with the answers that decide it.
 *
 * **NO COPY LIVES HERE.** A slot reports ids and booleans; `src/panel/strings.ts`
 * owns every word, per CLAUDE.md. That is also why `after` is a slot id rather
 * than the filename it prints as.
 */

/** The three files, in the order the work brain builds them. */
export type FileSlotId = 'context' | 'skills' | 'actions';

/**
 * `open` — the file exists and can be opened (VB-37's file view).
 * `locked` — it is part of the story, not part of this release.
 *
 * Deliberately two states and not three. "Built but not started" is not a
 * lock, it is a file with nothing in it yet, and `sectionHealthMap` already
 * says so far better than a third state here could.
 */
export type FileSlotState = 'open' | 'locked';

export interface FileSlot {
  id: FileSlotId;
  state: FileSlotState;
  /** The file immediately before this one on the shelf; `null` for the first. */
  after: FileSlotId | null;
  /**
   * Whether `after` is itself finished. Always `false` when there is nothing
   * before it.
   *
   * THIS EXISTS SO A LOCKED ROW CANNOT LIE. "Finish Context.md first" is the
   * true and useful line right up until the moment somebody finishes
   * Context.md — after which it reads as an instruction they have already
   * carried out and a lock that ignored them. The row swaps to saying the file
   * simply is not built yet, which is the fact that is true from then on.
   */
  afterFinished: boolean;
}

/** The shelf, in order. The order is the dependency chain: each file waits on
 * the one before it. */
export const FILE_SLOT_IDS: readonly FileSlotId[] = ['context', 'skills', 'actions'] as const;

/**
 * The files this release really builds.
 *
 * One entry, on purpose. `src/schema/flow.types.ts` already declares
 * `FlowId = 'context' | 'proof' | 'skills' | 'actions' | 'drift'` and
 * `Flow.tsx` is already "one generic step runner for all five flows"
 * (docs/V1.7-REFINEMENT.md VB-36) — so shipping Skills means authoring flow
 * data and adding its id to this list, not building a surface. This constant
 * is the seam, and it is the only thing in the panel that decides whether a
 * slot is a door or a promise.
 */
const BUILT: readonly FileSlotId[] = ['context'] as const;

/**
 * The shelf, given which files are finished.
 *
 * `finished` is keyed by slot id so a caller only has to answer for the files
 * it can actually measure — an absent key reads as "not finished", which is
 * the truthful answer for a file that does not exist yet.
 */
export function fileSlots(finished: Readonly<Partial<Record<FileSlotId, boolean>>>): FileSlot[] {
  return FILE_SLOT_IDS.map((id, index) => {
    const after = index === 0 ? null : (FILE_SLOT_IDS[index - 1] as FileSlotId);
    return {
      id,
      state: BUILT.includes(id) ? 'open' : 'locked',
      after,
      afterFinished: after === null ? false : finished[after] === true,
    };
  });
}

/**
 * Is every question this file would really ask answered or explicitly skipped?
 *
 * Built on `summariseSectionHealth` rather than on a second count of its own,
 * for the reason `core/recommend/engine.ts` folds in `computeNextMove` instead
 * of re-deriving it: two counters over the same answers eventually disagree,
 * and the one that disagrees is always the one nobody is looking at.
 *
 * `partly` covers "some answered, some left"; `notYet` covers "nothing here at
 * all"; `here` cannot occur, because the file view asks about a file rather
 * than about a question on screen and passes `null` for the current question —
 * it is tested anyway, so a future caller that does pass one cannot quietly
 * make a half-written file report as finished.
 *
 * ── A SKIPPED QUESTION DOES NOT COUNT AS ANSWERED ────────────────────────
 *
 * This is settled by precedent rather than by taste, because two modules
 * disagreeing about what a skip means is a bug waiting to happen.
 *
 * `applySkip` (core/flow/runner.ts) writes `null`, and `null` is a RECORDED
 * answer — deliberately distinguishable from a key that is simply absent
 * (docs/ARCHITECTURE.md, "wb:answers, precisely"). That distinction is real
 * and is used: `core/files/generate.ts` prints a skipped question with a
 * visible marker instead of omitting it, and `findPosition` will not re-ask
 * it. What it is NOT is content in the file.
 *
 * `core/freshness/sectionHealth.ts` has already drawn the line: `tally`
 * counts a skip into `skipped` and never into `answered`, `stateFor` calls a
 * section `done` only when `answered === total`, and
 * `sectionCompletionPercent`'s own note spells out why — *"a skipped question
 * is deliberately NOT counted as answered — it is not in the file"*. So a
 * section holding a skip is `partly`, and this function, which is a fold over
 * exactly those states, reports the file as unfinished. Match, do not argue.
 *
 * The consequence is the honest one: a locked row keeps saying "Finish
 * Context.md first" while a question in it is still passed on. Going back and
 * answering it is what changes that, and that is a true instruction rather
 * than a kind one.
 */
export function fileFinished(
  outline: FileOutlineNode[],
  modules: Module[],
  answers: Answers,
  now: Date,
): boolean {
  // A file with no sections is not a finished file, it is a missing one — and
  // every count below would be zero, which would otherwise read as "done".
  if (outline.length === 0) return false;
  const summary = summariseSectionHealth(outline, sectionHealthMap(outline, modules, answers, null, now));
  return summary.here === 0 && summary.partly === 0 && summary.notYet === 0;
}
