import type { Option, Step } from '../../schema/flow.types';

/**
 * V2.5 VB-122 — WHICH QUESTIONS ARE ASKED AS THE DIVIDED LINE, AND WHAT THE
 * LINE OFFERS.
 *
 * ── THE SCOPE (a list of one, the house pattern) ──────────────────────────
 *
 * `role_for` — "Who or what is this role for?" — is the one question drawn
 * as the divided line: options start dim, black-and-white, on the LEFT;
 * crossing one (a drag, or Space/Enter — FLAG 4) lands it on the lighter
 * RIGHT side in full colour. Same deliberate-line contract as orbs.ts and
 * verticalPick.ts: presentation keyed by the data it decorates, recorded in
 * exactly one place, `source.ts` never edited.
 *
 * ── OFFERED vs HELD vs CUSTOM (the VB-122 back-compat law) ────────────────
 *
 * The overrides (core/flow/overrides.ts, role_for) reshape the question's
 * option list to decision 3's five — and KEEP the three ported keys the new
 * list drops, because a stored answer resolves to its label in the generated
 * file and must go on doing so forever. That leaves the data holding eight
 * options and the screen owing three different treatments:
 *
 *  - OFFERED — the five the line puts in front of everybody, in decision 3's
 *    own order. `offeredLineOptions`.
 *  - HELD — a ported key a pre-VB-122 file already stored ('employer',
 *    'clients', 'organization'). Never offered to anybody new, but where it
 *    IS the stored answer it appears on the line as one more entry — crossed,
 *    since it is the answer — wearing its ported label, and the stored value
 *    stays exactly the string it was. `heldLineOptions`, computed once at
 *    mount against the stored selection so an entry does not vanish the
 *    moment a different one is crossed.
 *  - CUSTOM — a value not in the data at all (typed via add-your-own, now or
 *    in an old file). That is `customOptions.ts`'s existing job
 *    (`offListOptions`), unchanged; the line just renders what it derives.
 *
 * Why the split lives here and not in the component: which options a screen
 * offers is a product decision about the DATA, and the test that pins it
 * (dividedLine.test.ts) holds it against the real flow — a renamed key fails
 * in core, loudly, not as a silently empty tile in a browser.
 */

/** The questions asked as the divided line. See the header before adding. */
export const DIVIDED_LINE_QUESTIONS: readonly string[] = ['role_for'] as const;

/** The keys the line offers, per question, in the order decision 3 confirmed. */
export const DIVIDED_LINE_OFFERED: Record<string, readonly string[]> = {
  role_for: ['myself', 'family', 'team', 'my-clients', 'community'],
};

/**
 * Whether this question is asked as the divided line. `kind` checked as well
 * as `id` — the orbs.ts line: a question that stopped being a chips pick
 * would have to stop being drawn like one.
 */
export function usesDividedLine(step: { id: string; kind: string }): boolean {
  return step.kind === 'chips' && step.id in DIVIDED_LINE_OFFERED && DIVIDED_LINE_QUESTIONS.includes(step.id);
}

/**
 * The options the line offers, resolved against the step's own data so the
 * label is always the one the file prints. A key the data no longer carries
 * is skipped rather than invented — dividedLine.test.ts is what makes that
 * drift loud, in core, where the difference between "missing" and "not
 * applicable" is checkable.
 */
export function offeredLineOptions(step: Step): Option[] {
  const offered = DIVIDED_LINE_OFFERED[step.id] ?? [];
  const byKey = new Map((step.options ?? []).map((o) => [o.v, o]));
  const result: Option[] = [];
  for (const key of offered) {
    const option = byKey.get(key);
    if (option) result.push(option);
  }
  return result;
}

/**
 * The held entries: stored values the data still knows but the line no
 * longer offers. Order follows `selected` (for a single-select that is one
 * entry at most, but the shape stays general). Values the data does not know
 * at all are NOT here — they are `offListOptions`'s custom entries.
 */
export function heldLineOptions(step: Step, selected: readonly string[]): Option[] {
  const offered = new Set(DIVIDED_LINE_OFFERED[step.id] ?? []);
  const byKey = new Map((step.options ?? []).map((o) => [o.v, o]));
  const result: Option[] = [];
  for (const value of selected) {
    if (offered.has(value)) continue;
    const option = byKey.get(value);
    if (option) result.push(option);
  }
  return result;
}
