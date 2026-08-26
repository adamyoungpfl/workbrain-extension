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

/**
 * V2.2 VB-82 — Skills' own entry, in its own map so the Context snapshot
 * test's "no key may name an open-ended block" rule keeps guarding the ported
 * wording without knowing Skills exists. The copy is the SIGNED-OFF draft's
 * (docs/V2.2-COPY-DRAFT.md): the yes/no prompt and, for an added record, the
 * wizard's own [ADAPTED] deliverable question as the name ask. The draft's
 * two extra hint lines ("Its name becomes the word you'll type to run it" /
 * "One is enough to finish the file…") have no field on this three-field
 * screen — recorded here rather than silently dropped; the second line's job
 * is done by skl3's wrap instead.
 */
export const SKILLS_ADD_ANOTHER: Record<string, AddAnotherCopy> = {
  skills: {
    prompt: 'Want to add another skill?',
    namePrompt: "What's the deliverable you're tired of re-explaining?",
    namePlaceholder: 'Name the deliverable',
  },
};

export function addAnotherCopyFor(blockId: string): AddAnotherCopy | undefined {
  return ADD_ANOTHER[blockId] ?? SKILLS_ADD_ANOTHER[blockId];
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
