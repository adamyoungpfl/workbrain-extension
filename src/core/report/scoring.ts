import type { ReportState, ScoreEntry } from '../../schema/storage.types';

/**
 * R1-11's whole write path into `wb:report.scores` — pure, no chrome.*, no
 * DOM. Deliberately narrow: METRICS.md's full report engine (setup tax,
 * correction rate, the rest of the improvement report) is out of scope for
 * Release 1 (docs/RELEASE-1.md's "Out of scope" list names it explicitly).
 * This is only the proof loop's own accept criterion — "completing it
 * writes one score to wb:report.scores" — never a computed delta, never
 * the baseline number, per the confirmed product decision in the R1-11
 * task brief.
 */

/**
 * BS-03d — the entry is the person's own tally now.
 *
 * `value` was the with-context score out of ten; it is the count of what
 * they ticked, and `of` is how many statements they were offered. The old
 * rule survives unchanged in spirit: still one number about the with-file
 * answer, still never the baseline, still never a computed comparison.
 */
export function makeScoreEntry(ticked: number, of: number, at: string): ScoreEntry {
  return { at, value: ticked, of };
}

/** Appends, never replaces — a person may run the proof loop again months
 * later, and `scores` is the history that makes a trend visible eventually
 * (METRICS.md's "history trend" row). `report` defaults to an empty history
 * so a first-ever run doesn't need its caller to know the shape. */
export function appendScore(report: ReportState | undefined, entry: ScoreEntry): ReportState {
  const base: ReportState = report ?? { scores: [] };
  return { ...base, scores: [...base.scores, entry] };
}

/* BS-03d deleted `scoreDelta`. It subtracted the baseline's number from the
   with-file number, and neither exists any more: the person ticks statements
   about the with-file answer alone, so there is no pair to compare. Adam's
   P1 also deleted the round trip that produced the two numbers — the AI is
   no longer asked to grade itself. Recorded rather than silently dropped,
   per the `splashLoading` precedent in strings.ts. */
