import type { Answers } from '../../schema/storage.types';

/**
 * BS-03a (§3) — THE MICRO-PROOF'S TASK.
 *
 * At the end of My World, roughly sixteen questions in, the panel offers one
 * round trip: a short task built from what the person has actually typed,
 * sent with the answers so far. No baseline, no scoring, no comparison —
 * "the absence of a before is the point" belongs to proof two; here the
 * point is simply that their AI comes back knowing something it could not
 * have known.
 *
 * ── THE LADDER, AND WHY IT MOVED ──────────────────────────────────────────
 *
 * Adam's D2 set the order: a named person, then a named initiative, then
 * their role, then their own words about what they do. P4 first put this at
 * the second run boundary — and building it found that neither of the top
 * two rungs can be reached there: `entities` is asked in My World (module 4)
 * and `initiatives_records` in Initiatives (module 5), both AFTER About Me.
 * The review's own example — "Draft a note to Priya about Northstar" —
 * cannot be assembled at minute six, because Priya has not been named yet.
 *
 * So Adam moved it to the end of My World, which is the first boundary where
 * a real person's name exists. The ladder is unchanged; it can now actually
 * climb.
 *
 * ── WHAT THIS RETURNS ─────────────────────────────────────────────────────
 *
 * The task text itself, because a prompt is not panel chrome — the same
 * precedent `proofSource.ts`'s BASELINE_PROMPT and `interviewMe.ts` set. And
 * the rung it reached, so the panel can say what to look for without
 * guessing at what the AI will do.
 */

export type MicroProofRung = 'person' | 'initiative' | 'role' | 'self' | 'goal';

export interface MicroProofTask {
  rung: MicroProofRung;
  /** The name the task leans on, when it has one. */
  name?: string;
  /** What the person sends. */
  task: string;
}

function firstNamed(answers: Answers, blockId: string, field: string): string | undefined {
  for (const record of answers.repeatables[blockId] ?? []) {
    const value = record[field];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return undefined;
}

function text(answers: Answers, key: string): string | undefined {
  const value = answers.values[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/**
 * The strongest task this person's answers can support, first rung wins.
 *
 * Never returns null: the last rung needs nothing but the file itself, so
 * somebody who has skipped their way here still gets a real errand rather
 * than an apology.
 */
export function microProofTask(answers: Answers): MicroProofTask {
  const person = firstNamed(answers, 'entities', 'entity_name');
  if (person) {
    return {
      rung: 'person',
      name: person,
      task: `Draft a short note to ${person} about what I am working on right now.`,
    };
  }

  const initiative = firstNamed(answers, 'initiatives_records', 'initiative_name');
  if (initiative) {
    return {
      rung: 'initiative',
      name: initiative,
      task: `Draft a short update on ${initiative} — where it stands and what I need.`,
    };
  }

  const role = firstNamed(answers, 'roles', 'role_name');
  if (role) {
    return {
      rung: 'role',
      name: role,
      task: `Draft a short note introducing what I do as ${role} to someone I am about to work with.`,
    };
  }

  if (text(answers, 'self_description')) {
    return {
      rung: 'self',
      task: 'Draft a short introduction of me for someone I am about to work with.',
    };
  }

  const goal = text(answers, 'goal_want');
  return {
    rung: 'goal',
    task: goal ?? 'Draft a short status update for my manager.',
  };
}
