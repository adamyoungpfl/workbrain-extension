import type { Answers } from '../../schema/storage.types';

/**
 * BS-03d (§3.3) — WHAT THE PERSON TICKS, ASSEMBLED FROM WHAT THEY SAID.
 *
 * The old landing asked for two numbers out of ten. Grading two paragraphs
 * on a scale is work, it feels like a survey, and it made the panel ask for
 * a judgement rather than record one. The review's replacement is a short
 * list of statements the person ticks off themselves — faster, honest, and
 * ticking four boxes is itself a completion.
 *
 * Adam's ruling (P2): the statements are **assembled from their own
 * answers**, with a fixed pair as the floor. "Used Priya's name" is a
 * different claim from "used my manager's name" — the first is checkable
 * against the answer in front of them, and it is the one that makes the
 * point that their file did something.
 *
 * ── WHY THIS RETURNS IDS AND NOT SENTENCES ────────────────────────────────
 *
 * CLAUDE.md: every user-facing string lives in `src/panel/strings.ts`. So
 * this decides WHICH checks are true of this person and what to fill them
 * with; the panel decides how they read. Same split as `core/files/slots.ts`
 * and `lockLine`.
 *
 * ── WHY THE LIST IS VARIABLE-LENGTH, AND WHAT THAT COSTS ──────────────────
 *
 * Somebody who named nobody gets two checks, not four. That is why the
 * stored entry carries `of` alongside `value` (core/report/scoring.ts):
 * "two of two" and "two of four" are different facts and a bare count cannot
 * tell them apart. The floor is two rather than zero because those two
 * statements — it sounded like me, it asked for the right thing — are true
 * of every answer any AI ever writes back, and need no context to judge.
 *
 * NOTHING HERE IS OBSERVED. Every input is an answer the person typed, and
 * the output is a list of things to ask THEM. The panel still never reads
 * the AI's reply — see docs/GUARDRAILS.md's authorship test.
 */

export type ProofCheckId = 'person' | 'project' | 'voice' | 'ask';

export interface ProofCheck {
  id: ProofCheckId;
  /** The name to print, for the two checks that carry one. */
  name?: string;
}

/** The first non-empty name in a repeatable block, by its own name field. */
function firstNamed(
  answers: Answers,
  blockId: string,
  field: string,
): string | undefined {
  for (const record of answers.repeatables[blockId] ?? []) {
    const value = record[field];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return undefined;
}

/**
 * The checks to offer, in reading order: the specific ones first, because a
 * name coming back is the thing that lands, and the two general ones after.
 */
export function proofChecks(answers: Answers): ProofCheck[] {
  const checks: ProofCheck[] = [];

  // A person they named. `entities` is "the people, teams and tools you
  // mention constantly" — the first named one is the one most likely to
  // appear in a status update, which is what the proof task usually is.
  const person = firstNamed(answers, 'entities', 'entity_name');
  if (person) checks.push({ id: 'person', name: person });

  // A named effort. Initiatives are asked for by name first (source.ts's
  // `initiative_name` leads the block), so a started record has one.
  const project = firstNamed(answers, 'initiatives_records', 'initiative_name');
  if (project) checks.push({ id: 'project', name: project });

  // The floor. True of any reply, judgeable with no context at all, and the
  // reason somebody who has named nobody still has something to tick.
  checks.push({ id: 'voice' });
  checks.push({ id: 'ask' });

  return checks;
}

/**
 * The sentence under the ticks is written from the count, so the person is
 * told what they just observed rather than what the panel thinks of it.
 * Returned as the two numbers; the words are the panel's.
 */
export function proofTally(ticked: readonly ProofCheckId[], offered: readonly ProofCheck[]): {
  value: number;
  of: number;
} {
  const ids = new Set(offered.map((check) => check.id));
  // Only count ticks against checks that were actually offered — a stale tick
  // from a re-run with different answers cannot inflate the number.
  return { value: ticked.filter((id) => ids.has(id)).length, of: offered.length };
}
