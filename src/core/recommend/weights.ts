import type { RecommendationKind } from './types';

/**
 * V1.5 VB-28 — the ranking, AS A TABLE.
 *
 * Same discipline as core/freshness/halfLives.ts: every number below is a
 * product judgement about what is worth someone's next five minutes, and a
 * product judgement has to be reviewable in one place and arguable by Adam
 * without reading any logic. Nothing else in the engine decides order.
 *
 * ── THIS IS NOT A SCORE ───────────────────────────────────────────────────
 *
 * docs/GUARDRAILS.md rules out "a composite score out of 100. Real metrics
 * only." `rank` is an ordering key, never a reading: it is not rendered, not
 * stored, not summed across a file, and there is no "your brain scores 240"
 * anywhere. What the person sees is the recommendation itself, and the only
 * numbers in that are counts and dates. The difference is the same one
 * docs/BACKLOG-file-quality-and-intake.md draws between a diagnostic and a
 * vanity number, and it is worth holding even though a headline number would
 * demo better.
 *
 * ── WHY THE ORDER IS THIS ORDER ───────────────────────────────────────────
 *
 * VB-28's own brief: "one strong recommendation beats five weak ones". So the
 * question each weight answers is not "how bad is this" but "if this person
 * does exactly one thing, which one changes the most". Two principles settle
 * every row:
 *
 *   1. **A file that is WRONG beats a file that is THIN.** Stale content is
 *      confidently wrong content, and confidently wrong output is worse than
 *      thin output — docs/BACKLOG-file-quality-and-intake.md's own Currency
 *      dimension says exactly this. So the two staleness kinds sit at the top.
 *   2. **Cheap and named beats broad and vague.** "Say what done looks like
 *      for the Atlas migration" is one question about one thing they named
 *      themselves. "Have another look at How I Communicate" is seven. The
 *      concrete one goes first when the weights are otherwise close.
 *
 * | Kind                    | Base | Reasoning                                                     |
 * |-------------------------|------|---------------------------------------------------------------|
 * | role-stale              | 120  | The narrowest, cheapest fix in the product: one chip, and it   |
 * |                         |      | corrects the fact everything else in the file hangs off. Also  |
 * |                         |      | R1-12's existing next-move card, whose place at the top of     |
 * |                         |      | Home this table has to preserve rather than quietly demote.   |
 * | section-stale           | 100  | A whole section untouched past its own clock. Wrong beats      |
 * |                         |      | thin, but this is a re-read of several answers, not one tap.   |
 * | initiative-no-success   |  80  | Named by them, one question, and halfLives.ts already calls    |
 * |                         |      | success criteria "the single most likely thing in the file to  |
 * |                         |      | be quietly wrong".                                             |
 * | section-empty           |  60  | A whole area of the file blank. Real coverage gap, but they    |
 * |                         |      | passed on it once already, so it never outranks a live error.  |
 * | entities-thin           |  40  | One name where the section is built for several. Genuinely     |
 * |                         |      | useful, genuinely optional.                                    |
 * | initiatives-thin        |  20  | The same shape, one step lower: a person may really only have  |
 * |                         |      | one project, more often than they really only know one person. |
 *
 * EVERY BAND IS TWENTY POINTS WIDE, and `STALENESS_URGENCY_MAX` below is
 * fifteen, so urgency can separate two stale sections but can never let one
 * jump a role or fall behind an empty section. `weights.test.ts` asserts the
 * gap, so narrowing one here fails the build rather than quietly reordering
 * somebody's Home screen.
 */
export const RECOMMENDATION_WEIGHT: Readonly<Record<RecommendationKind, number>> = {
  'role-stale': 120,
  'section-stale': 100,
  'initiative-no-success': 80,
  'section-empty': 60,
  'entities-thin': 40,
  'initiatives-thin': 20,
};

/**
 * How much a section's own overdueness may move it, within its band.
 *
 * A section twice past its clock ranks above one a day past it, which is the
 * only fair way to order ten sections that are all "due". Capped at fifteen —
 * under the twenty-point band width — so the band can never be escaped. See
 * the gap note above.
 *
 * WHAT THIS IS NOT: a count of days of neglect shown to anybody.
 * docs/GUARDRAILS.md's "never guilt" line means the *copy* never says "you
 * have ignored this for 214 days"; it says when they last wrote it, which is
 * a date and is true. Using overdueness to decide which of two offers to make
 * first is a different act entirely, and it happens here, out of sight.
 */
export const STALENESS_URGENCY_MAX = 15;

/**
 * `0` at the moment a section falls due, `STALENESS_URGENCY_MAX` once it is
 * twice its own half-life old, flat after that.
 *
 * Relative to the section's OWN clock, not to a global one, so five months of
 * silence on My World (120 days) outranks five months on How I Communicate
 * (730 days) — which is right, because only one of those is unusual.
 */
export function stalenessUrgency(ageDays: number, halfLifeDays: number): number {
  if (halfLifeDays <= 0) return STALENESS_URGENCY_MAX;
  const overdue = (ageDays - halfLifeDays) / halfLifeDays;
  if (overdue <= 0) return 0;
  return Math.min(STALENESS_URGENCY_MAX, Math.round(overdue * STALENESS_URGENCY_MAX));
}
