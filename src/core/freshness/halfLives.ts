import { DUE_AFTER_DAYS } from './clocks';

/**
 * V1.3 VB-19 — how fast each file section goes stale, AS DATA.
 *
 * THE POINT OF THIS FILE IS THAT IT IS A TABLE, NOT LOGIC. Every number below
 * is a product judgement about how long an answer stays true, and product
 * judgements have to be reviewable and changeable in one place. Nothing else
 * in the codebase decides when a section is due; `sectionHealth.ts` reads
 * this and nothing more.
 *
 * WHY NOT ONE GLOBAL THRESHOLD. `clocks.ts` already ships DUE_AFTER_DAYS =
 * 182, and `computeNextMove` applies it to `role_durability`. Applying that
 * same six months to *everything* would mean the panel asking somebody, twice
 * a year, whether they still prefer short sentences. docs/GUARDRAILS.md rules
 * out "nudges framed as guilt", and a nudge about an answer that was never
 * going to change is exactly that — a false positive that teaches the person
 * to ignore the real ones. So the sections that genuinely churn get a short
 * clock and the sections that describe a person rather than their week get a
 * long one.
 *
 * THE NUMBERS, AND WHY EACH ONE. Adam should read this column and argue with
 * it; that is what it is for.
 *
 * | Section                     | Days | Reasoning                                                        |
 * |-----------------------------|------|------------------------------------------------------------------|
 * | 1. About This Context       | 365  | What the file is *for*. Moves with a life change, not a quarter.  |
 * | 2. About Me                 | 365  | Name and self-description. A year is already generous.            |
 * | 2.1 Roles                   | 182  | THE ONE NUMBER THAT IS NOT FREE (see below).                      |
 * | 2.2 Responsibilities        | 182  | What you own moves with a reorg, and reorgs run about twice a year.|
 * | 2.3 Boundaries              | 365  | What is not yours changes when the role does, and slower.         |
 * | 2.4 Decision Rights         | 182  | Same clock as responsibilities — a promotion changes both at once.|
 * | 2.5 Expertise               | 730  | Expertise accrues. It does not lapse on a schedule.               |
 * | 3. My World                 | 120  | People move, teams reorg, tools get replaced. The fastest churn.  |
 * | 4. Initiatives              | 90   | A quarter. Projects end; success criteria set last quarter are    |
 * |                             |      | the single most likely thing in the file to be quietly wrong.     |
 * | 5. How I Think              | 730  | Risk tolerance and appetite for ambiguity are temperament.        |
 * | 6. How I Communicate        | 730  | Voice. Nagging somebody about this is the bug this table exists   |
 * |                             |      | to prevent — it is deliberately the longest clock in the file.    |
 * | 7. Audience Profiles        | 365  | Who you write to changes with a job, not with a sprint.           |
 * | 8. Vocabulary & Knowledge   | 365  | Jargon accretes slowly and old jargon stays true.                 |
 * | 9. Context Boundaries       | 730  | Standards and guardrails are set once and meant to hold.          |
 * | 10. Reference Examples      | 365  | A writing sample a year old still sounds like the same person.    |
 *
 * ROLES IS PINNED TO 182 ON PURPOSE. `nextMove.ts` already puts a due role on
 * Home's banner at DUE_AFTER_DAYS. If this table gave 2.1 Roles a different
 * clock, Home could say a role is due while the drawer says the section is
 * fine, or the reverse. Two surfaces disagreeing about one answer is worse
 * than either number being slightly wrong, so they are the same number by
 * construction: `DUE_AFTER_DAYS`, imported, not retyped.
 *
 * "HALF-LIFE" IS A LOOSE WORD HERE AND THAT IS FINE. Nothing decays
 * continuously; a section is fresh until its clock runs out and due after.
 * The word is kept because it is the one Adam used and it carries the right
 * idea: different content ages at different speeds.
 *
 * An id with no entry falls back to the default, so adding a section to
 * `CONTEXT_FILE_OUTLINE` can never crash — it just inherits six months until
 * somebody decides better. `halfLives.test.ts` asserts every shipped section
 * id has a real entry, so "inherits the default" stays a fallback rather than
 * quietly becoming the policy.
 */

/** What an unlisted section gets: the one threshold this product had already
 * settled on (docs/workbrain-spec.html's six months for untouched content). */
export const DEFAULT_HALF_LIFE_DAYS = DUE_AFTER_DAYS;

export const SECTION_HALF_LIFE_DAYS: Readonly<Record<string, number>> = {
  sec1: 365,
  sec2: 365,
  'sec2-1': DUE_AFTER_DAYS,
  'sec2-2': DUE_AFTER_DAYS,
  'sec2-3': 365,
  'sec2-4': DUE_AFTER_DAYS,
  'sec2-5': 730,
  sec3: 120,
  sec4: 90,
  sec5: 730,
  sec6: 730,
  sec7: 365,
  sec8: 365,
  sec9: 730,
  sec10: 365,
  // V2.2 — Skills.md's one section. 180 days, Adam's own number (approved
  // 2026-08-26): skills drift faster than identity, slower than a quarter's
  // initiatives. `skl` prefix from question one — this map is flat and
  // shared, and a Skills section named `sec1` would inherit Context's
  // 365-day clock with no error (docs/V2.2-SKILLS.md, risk 1).
  skl1: 180,
};

/** How long this section's answers stay current, in days. */
export function halfLifeFor(sectionId: string): number {
  return SECTION_HALF_LIFE_DAYS[sectionId] ?? DEFAULT_HALF_LIFE_DAYS;
}
