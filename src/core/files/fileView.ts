import type { FileOutlineNode, Module } from '../../schema/flow.types';
import type { Answers } from '../../schema/storage.types';
import { navigationTargetFor, outlineNodeState } from '../flow/outline';
import { findPosition } from '../flow/runner';
import type { SectionHealth } from '../freshness/sectionHealth';
import { sectionHealthMap } from '../freshness/sectionHealth';

/**
 * V1.7 VB-37 — one file, opened: its sections, and which of them can be
 * walked back into.
 *
 * The file view lets somebody run the interview for the whole file, or click
 * into one section and do that part on its own. Neither of those is new
 * routing: `Flow`'s `initialPosition` has taken a deep link since R1-12, and
 * `core/flow/outline.ts`'s `navigationTargetFor` → `positionForQuestionId`
 * pair is the same seam the drawer's file tree navigates through. This module
 * is the one derivation the surface actually needs — which rows there are, how
 * each one is doing, and which of them is a door.
 *
 * ── WHY THE ROWS ARE DERIVED HERE AND NOT IN THE COMPONENT ────────────────
 *
 * "Can this row be opened" is a rule with a reason and an edge, and it is a
 * rule the drawer already holds (components/FileTree.tsx): an UNTOUCHED
 * section is not a link. Its own note says why — *"jumping ahead to a section
 * nobody has reached would skip past required questions the flow otherwise
 * guarantees get asked — this is review navigation … never a shortcut through
 * the interview."* That is exactly as true from Home as it is from the
 * drawer, and having the two views of one file disagree about which sections
 * are reachable would be worse than either answer on its own. So the rule
 * lives in one place, with a test, and both surfaces print it.
 *
 * The way into an untouched section is the whole-file button, which is what
 * `fileStartTarget` is for.
 *
 * **NOTHING HERE IS STORED.** Every row is recomputed from `wb:answers` on
 * every render, like `sectionHealthMap` it folds over and like every other
 * derivation in this codebase (docs/ARCHITECTURE.md, "nothing derived is
 * stored"). There is no record of which sections have been opened.
 *
 * **NO COPY LIVES HERE.** `label` is the outline's own section name — the
 * file's text, not interface chrome — exactly as `core/flow/multiples.ts`
 * hands back the file's own group titles. Everything the surface says about a
 * row comes from `src/panel/strings.ts`.
 */

export interface FileSectionRow {
  /** The outline node's id — `sec2`, `sec3` … */
  id: string;
  /** The section's own name, straight off the outline. */
  label: string;
  /** Its health, rolled up over its children (core/freshness/sectionHealth.ts). */
  health: SectionHealth;
  /**
   * The question id this row opens to, or `null` when it is not a door yet.
   *
   * `null` for a section nobody has reached (see the header), and `null` for a
   * section the outline lists no questions under at all — a row that offered
   * to open nothing would be a control that does nothing.
   */
  target: string | null;
}

/**
 * The file's top-level sections, in FILE ORDER.
 *
 * Top level only, and never resorted. VB-19 settled that for the drawer's
 * list — *"the list IS the file, and resorting it by urgency would stop it
 * matching the thing it represents"* — and the file view is the same claim
 * made larger: it is the file, opened. Each row's health already rolls its
 * children in (`sectionHealthMap`), so nothing is hidden by only listing ten.
 */
export function fileSectionRows(
  outline: FileOutlineNode[],
  modules: Module[],
  answers: Answers,
  now: Date,
): FileSectionRow[] {
  // One walk for the whole tree, not one per row — the same reason
  // `sectionHealthMap` exists rather than a function each row calls.
  const health = sectionHealthMap(outline, modules, answers, null, now);
  return outline.map((node) => {
    // `null` for the current question: nothing is on screen here. The file
    // view is not the interview, so no section is "Here".
    const reached = outlineNodeState(node, answers.values, null) !== 'untouched';
    const target = navigationTargetFor(node);
    return {
      id: node.id,
      label: node.label,
      health: health[node.id] as SectionHealth,
      target: reached && target ? target : null,
    };
  });
}

/**
 * The question the whole file starts at — its first section's first question.
 *
 * Only wanted when there is nothing to resume to; see `fileCanResume`.
 *
 * `null` on an empty outline, which is a file with nothing in it rather than a
 * file to walk.
 */
export function fileStartTarget(outline: FileOutlineNode[]): string | null {
  const first = outline[0];
  return (first && navigationTargetFor(first)) ?? null;
}

/** `Flow`'s own two ephemeral sets, empty — which is exactly the state it
 * mounts in. See `fileCanResume`. */
const NOTHING: ReadonlySet<string> = new Set();

/**
 * Is there a question left to resume to?
 *
 * The whole-file button normally hands `Flow` no position at all and lets
 * `findPosition` resume from wherever `wb:answers` really leaves off — what
 * "pick up where you left off" has meant since R1-12. But when the interview
 * has nothing left to ask, `findPosition` answers `done` and `Flow` hands
 * straight back to Home without ever showing a question: a button that appears
 * to do nothing. So that case walks the file from the top instead, and says so
 * (`fileGoThroughAgain`).
 *
 * ── IT ASKS THE RUNNER, RATHER THAN GUESSING FROM THE SECTIONS ────────────
 *
 * The obvious shortcut is "every section is done, so it must be finished", and
 * it is WRONG — measured on a real fixture, not reasoned about. A file whose
 * every question is answered but which holds repeatable records still resumes:
 * `findPosition` offers the "is there another one?" screen for each block,
 * because `declinedBlocks` is ephemeral and empty on every mount
 * (tests/e2e/file-accordion.spec.ts seeds exactly that file). Reading
 * `summariseSectionHealth` there would send somebody back to question one when
 * the interview genuinely had something left to ask them.
 *
 * So this asks the one function that decides it, with the same two empty sets
 * `Flow` itself mounts with, and cannot disagree with what happens next.
 */
export function fileCanResume(modules: Module[], answers: Answers): boolean {
  return findPosition(modules, answers, NOTHING, NOTHING).kind !== 'done';
}
