import type { Answers } from '../../schema/storage.types';
import { isDue, daysSince, roughElapsed } from './clocks';
import type { Elapsed } from './clocks';

/**
 * The single "what should this person do next" derivation for Home
 * (docs/RELEASE-1.md R1-12) — folds over the `roles` repeatable rather than
 * reading a scalar, because a person can hold several roles, each
 * independently current or historical. Nothing here is stored; Home calls
 * this fresh on every render from whatever is actually in `wb:answers`, the
 * same "derived, never stored" discipline as core/flow/runner.ts's
 * `findPosition` (see docs/ARCHITECTURE.md, "Nothing derived is stored") —
 * which is what makes "changing a durability answer changes the next move
 * with no other action" (R1-12's own accept line) true for free: there is
 * no separate next-move state to fall out of sync with the answer that
 * decides it.
 *
 * A role only ever goes "due" while it's marked *current*. A role marked
 * historical is already understood as settled, past context — there is
 * nothing about it left to drift, so it can never appear here. That is what
 * makes flipping a role from current to historical change the next move
 * too, not just the current-to-stale direction: the item simply stops
 * being a candidate at all.
 */

export const ROLES_BLOCK_ID = 'roles';
export const ROLE_DURABILITY_KEY = 'role_durability';
/** Not a real ported Step id — the label a seeded `roles` record's name is
 * stored under (see core/flow/runner.ts's `reconcileSeededRepeatable` and
 * the `roles` block's `seedFrom.seedField` in core/flow/source.ts). */
export const ROLE_NAME_SEED_FIELD = 'role_name';

export interface DueRole {
  recordIndex: number;
  /** The role's own label, in the person's own words (or the picked
   * option's label) — empty string only if the record is somehow missing
   * its seed field, which `reconcileSeededRepeatable` never actually does. */
  role: string;
  elapsed: Elapsed;
}

export type NextMove =
  | { kind: 'start' }
  | { kind: 'due'; items: DueRole[] }
  | { kind: 'current' };

function hasAnyAnswer(answers: Pick<Answers, 'values' | 'repeatables'>): boolean {
  if (Object.keys(answers.values).length > 0) return true;
  return Object.values(answers.repeatables).some((records) => records.length > 0);
}

/** The most recent `answeredAt` (or `reflectedAt`) timestamp across every
 * answer — used for the file's own "N days old" / "Updated today" badge.
 * `undefined` when nothing has ever been answered. */
export function mostRecentAnsweredAt(answers: Pick<Answers, 'answeredAt' | 'reflectedAt'>): string | undefined {
  let latest: string | undefined;
  for (const at of [...Object.values(answers.answeredAt), ...Object.values(answers.reflectedAt)]) {
    if (!latest || at > latest) latest = at;
  }
  return latest;
}

export function computeNextMove(answers: Answers, now: Date = new Date()): NextMove {
  if (!hasAnyAnswer(answers)) return { kind: 'start' };

  const records = answers.repeatables[ROLES_BLOCK_ID] ?? [];
  const due: DueRole[] = [];

  records.forEach((record, recordIndex) => {
    if (record[ROLE_DURABILITY_KEY] !== 'current') return; // historical: never a candidate
    const answeredAt = answers.answeredAt[`${ROLES_BLOCK_ID}#${recordIndex}#${ROLE_DURABILITY_KEY}`];
    if (!answeredAt || !isDue(answeredAt, now)) return;
    const role = typeof record[ROLE_NAME_SEED_FIELD] === 'string' ? (record[ROLE_NAME_SEED_FIELD] as string) : '';
    due.push({ recordIndex, role, elapsed: roughElapsed(daysSince(answeredAt, now)) });
  });

  return due.length > 0 ? { kind: 'due', items: due } : { kind: 'current' };
}
