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

/** `value` is always the with-context score — never the baseline number,
 * never a computed delta (both exist only for on-screen display, computed
 * fresh by `scoreDelta` below, never persisted). */
export function makeScoreEntry(withContextScore: number, at: string): ScoreEntry {
  return { at, value: withContextScore };
}

/** Appends, never replaces — a person may run the proof loop again months
 * later, and `scores` is the history that makes a trend visible eventually
 * (METRICS.md's "history trend" row). `report` defaults to an empty history
 * so a first-ever run doesn't need its caller to know the shape. */
export function appendScore(report: ReportState | undefined, entry: ScoreEntry): ReportState {
  const base: ReportState = report ?? { scores: [] };
  return { ...base, scores: [...base.scores, entry] };
}

/** Display-only — the on-screen "that difference is your context working"
 * copy is computed from this, never stored (see this file's header). */
export function scoreDelta(baselineScore: number, withContextScore: number): number {
  return withContextScore - baselineScore;
}
