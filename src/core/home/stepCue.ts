import type { Utilization } from './utilization';

/**
 * BR-01 (Adam, 2026-08-28) — WHERE YOU ARE, AND WHAT IS NEXT.
 *
 * The meter said "Step 2 · Repeat". Adam, reviewing it in place: make it "an
 * animated back and forth of 'Current: [Current Phase]' and 'Next Up: [Next
 * Incomplete Phase]' or 'Next Up: Download and Prove It'."
 *
 * ── WHY A NEXT AT ALL ─────────────────────────────────────────────────────
 *
 * "Step 2 · Repeat" is a position. A position tells somebody where they are
 * standing and nothing about where the ground goes, and the meter's whole
 * problem was that it was honest and completely opaque (§6). A pair — here,
 * then there — is a direction, and a direction is the thing a person on Home
 * is actually looking for.
 *
 * ── WHAT "NEXT" IS WHEN THERE IS NO NEXT STEP ─────────────────────────────
 *
 * `currentStep` is "the first segment that is not full, or 4 when all are"
 * (core/home/utilization.ts), so the last step is its own successor and a
 * naive "current + 1" would promise a fifth step that does not exist. When
 * nothing incomplete is left ahead, `next` is `null` and the panel prints the
 * one real thing left to do — take the file out and prove it — rather than
 * inventing a phase or leaving the second half of a pair empty.
 *
 * NOTHING HERE IS STORED and nothing here is words: this returns the two
 * indices, and `src/panel/strings.ts` owns every syllable, per CLAUDE.md.
 */
export interface StepCue {
  /** 1-based, the step somebody is standing in. Always present. */
  current: 1 | 2 | 3 | 4;
  /**
   * 1-based, the next step with room left in it — or `null` when there is
   * none ahead, which is the panel's cue to name the finish instead.
   */
  next: 1 | 2 | 3 | 4 | null;
}

export function stepCue(utilization: Pick<Utilization, 'currentStep' | 'segments'>): StepCue {
  const filled = [
    utilization.segments.baseline,
    utilization.segments.context,
    utilization.segments.skill,
    utilization.segments.prove,
  ];

  // The next step with room in it, strictly AFTER the current one. Strictly,
  // because the current step is itself unfilled by definition — pointing at it
  // as the next thing would be a pair that says the same word twice.
  const nextIndex = filled.findIndex((percent, i) => i >= utilization.currentStep && percent < 100);

  return {
    current: utilization.currentStep,
    next: nextIndex === -1 ? null : ((nextIndex + 1) as 1 | 2 | 3 | 4),
  };
}
