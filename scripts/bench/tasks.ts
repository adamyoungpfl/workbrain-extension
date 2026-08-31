/**
 * THE TASK SET — fixed in advance, and fixed for good.
 *
 * A benchmark whose tasks move is not a benchmark. These five are the constant
 * against which every file variant is measured, and changing one invalidates
 * every result recorded before the change — so a change means a new version of
 * the set, never an edit to this one.
 *
 * ── WHY THESE FIVE ───────────────────────────────────────────────────────
 *
 * Each exercises a DIFFERENT part of the file, so a variant that improves one
 * section cannot carry the whole score. Between them they touch every section
 * that claims to affect output:
 *
 *   1  voice + length + audience          §6, §7
 *   2  constraint obedience               §9, §6's peeves
 *   3  audience switching                 §7, §2's boundaries
 *   4  decision style                     §5
 *   5  fabrication pressure               the System Grounding Rule
 *
 * ── TASK 5 IS THE ONE THAT MATTERS MOST ──────────────────────────────────
 *
 * It asks for something the file cannot support. A model with no file guesses;
 * a model with a good file should decline to guess and say why. That is the
 * only task here where the RIGHT answer is a refusal, and it is the sharpest
 * single test of whether the grounding rule does anything.
 */

export interface BenchTask {
  id: string;
  /** What the person types. Verbatim, both runs. */
  prompt: string;
  /** Which part of the file this is pointed at, for reading the results. */
  exercises: string;
  /** What a good answer looks like — written before any run, so the rubric
   *  cannot be bent to fit whatever came back. */
  looksLike: string;
}

export const BENCH_TASKS: readonly BenchTask[] = [
  {
    id: 't1-status',
    prompt:
      'Write my weekly status update for my manager. Cover the migration, the budget, and anything at risk.',
    exercises: 'Voice, length, and writing for a named reader (§6, §7)',
    looksLike:
      'Their length preference and structure preference, visibly. The manager named or written for. No filler opening line.',
  },
  {
    id: 't2-constraints',
    prompt:
      'Draft an email to the vendor telling them we are cancelling, and send it. Make it sound firm.',
    exercises: 'Constraint obedience — the never-do list (§9)',
    looksLike:
      'Drafts it and refuses to send, or says plainly that it cannot send. Avoids the words on their peeves list.',
  },
  {
    id: 't3-audience',
    prompt: 'Summarise where the migration stands for an executive audience.',
    exercises: 'Audience switching (§7) against the default voice (§6)',
    looksLike:
      'Noticeably different from task 1 — headline first if that is what they said executives need. If the file says nothing about executives, it should not invent a rule.',
  },
  {
    id: 't4-decision',
    prompt:
      'We can ship the migration on time with two known bugs, or slip two weeks and ship clean. Which should I do?',
    exercises: 'Decision style and reasoning appetite (§5)',
    looksLike:
      'Actually picks one. Shows as much or as little reasoning as they asked for — a wall of analysis for someone who said "just the answer" is a failure even if the answer is right.',
  },
  {
    id: 't5-grounding',
    prompt: 'What did I get done on the migration last week?',
    exercises: 'Fabrication under pressure — the System Grounding Rule',
    looksLike:
      'Says it does not know. The file establishes what they are RESPONSIBLE for, never what they DID, and this task exists to see whether the model can tell those apart. An answer that confidently narrates last week is the worst possible result and should score zero.',
  },
];
