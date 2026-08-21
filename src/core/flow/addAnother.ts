import type { RepeatableBlock } from '../../schema/flow.types';

/**
 * V1.4 VB-20 — the wording that lets a **seeded** repeatable grow, keyed by
 * block id.
 *
 * WHY THIS IS NOT IN source.ts
 * `source.ts` is a byte-faithful snapshot of the ported interview and says so
 * in its own header: "NOT hand-edited — any wording fix belongs upstream in
 * modelcitizen, then re-ported." This copy is new, authored here, and has no
 * upstream to be ported from — so it is attached by `adapter.ts` at build
 * time, exactly the way V1.1 VB-03's follow-ups are (see deepDive.ts, same
 * directory, same reasoning, same id-keyed shape).
 *
 * WHY THIS IS NOT IN src/panel/strings.ts
 * It is an interview question — printed as the question on its own screen and
 * read aloud by the narrator (core/voice/narration.ts speaks
 * `block.addAnotherPrompt`). Question wording lives in `core/flow` beside the
 * questions, never in the panel's interface copy (see CLAUDE.md, "Copy lives
 * in one file", and its stated exception).
 *
 * `npm run audit`'s reading-level rule only measures `src/panel/strings.ts`,
 * so — as with deepDive.ts — this file carries the same measurement in its
 * own test rather than shipping unmeasured.
 *
 * VOICE: `prompt` is deliberately the same sentence shape as the two ported
 * add-another prompts it now sits alongside ("Want to tell AI about another
 * person, team, tool, or process?"), so the roles loop ends in the interview's
 * own voice rather than in a new one.
 */
export interface AddAnotherCopy {
  /** the yes/no question at the end of the loop */
  prompt: string;
  /** the short text question that names the new record, asked on the same screen */
  namePrompt: string;
  /** what that field shows while it is empty */
  namePlaceholder: string;
}

/**
 * Only ever seeded blocks whose ported data asks nothing (`addAnotherPrompt:
 * ""`). This map OVERRIDES the snapshot, so a key naming an open-ended block
 * would silently replace wording that was ported verbatim — `addAnother.test.ts`
 * fails if one ever appears.
 */
export const ADD_ANOTHER: Record<string, AddAnotherCopy> = {
  roles: {
    prompt: 'Want to tell AI about another role?',
    namePrompt: 'What do you call this role?',
    namePlaceholder: 'A short name for it',
  },
};

export function addAnotherCopyFor(blockId: string): AddAnotherCopy | undefined {
  return ADD_ANOTHER[blockId];
}

/**
 * Whether this block's add-another screen has to name the new record — i.e.
 * whether the panel renders the name field. One place decides it, so the
 * runner, the renderer and the tests cannot disagree: a seeded block can only
 * grow by naming, because the name is what survives the next reconcile.
 */
export function needsName(block: RepeatableBlock): boolean {
  return Boolean(block.seedFrom && block.addAnotherName);
}
