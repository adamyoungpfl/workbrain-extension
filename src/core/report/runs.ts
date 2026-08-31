import type { ProofRun, ReportState } from '../../schema/storage.types';

/**
 * THE MEASUREMENT SPINE — the same task, answered at three stages.
 *
 * `docs/MEASUREMENT-SPINE.md`. Adam's thesis: a person arrives, their own goal
 * is answered with nothing loaded, then with the file, then with the file and
 * a recipe — and every question in the interview earns its place by moving one
 * of those arrows.
 *
 * This file is the fold that makes the three comparable. It stores nothing and
 * decides nothing about the interface; it groups runs by the task they
 * answered and says what is comparable to what.
 *
 * ── WHY GROUPING IS BY TASK AND NOT BY TIME ──────────────────────────────
 *
 * A person can change their goal. When they do, the old runs must stay
 * grouped under the old task rather than silently joining the new one — a
 * comparison between "draft my status update" and "help me plan a launch" is
 * not a comparison, it is two things on one axis. Time cannot tell those
 * apart; the task can, which is why the run carries it.
 */

/** The three stages, in the order the spine runs them. */
export const STAGES = ['baseline', 'context', 'skill'] as const;
export type Stage = (typeof STAGES)[number];

/** Adds a run, newest last, without disturbing what is there. */
export function appendRun(report: ReportState | undefined, run: ProofRun): ReportState {
  const base: ReportState = report ?? { scores: [] };
  return { ...base, runs: [...(base.runs ?? []), run] };
}

/** Every run of one task, in the order they happened. */
export function runsForTask(report: ReportState | undefined, task: string): ProofRun[] {
  const key = task.trim();
  return (report?.runs ?? []).filter((r) => r.task.trim() === key);
}

/**
 * The comparison: the LATEST run at each stage of one task.
 *
 * Latest rather than first, deliberately. Somebody who re-runs the with-file
 * condition after answering more questions has produced a better measurement
 * of the file, not a second data point about the old one — the spine is
 * "where am I now against where I started", and only the baseline is a
 * historical fact.
 *
 * The baseline is the exception and is pinned to the FIRST one: it is the
 * record of where they started, and a later "no file" run by somebody who has
 * since done the interview is not that.
 */
export function comparison(
  report: ReportState | undefined,
  task: string,
): Partial<Record<Stage, ProofRun>> {
  const runs = runsForTask(report, task);
  const out: Partial<Record<Stage, ProofRun>> = {};
  for (const run of runs) {
    if (run.stage === 'baseline') {
      out.baseline ??= run;
      continue;
    }
    out[run.stage] = run;
  }
  return out;
}

/** The task a comparison should be built around — the most recently run one. */
export function latestTask(report: ReportState | undefined): string | null {
  const runs = report?.runs ?? [];
  return runs.length ? (runs[runs.length - 1]!.task.trim() || null) : null;
}

/**
 * Everything every AI has said the file did not cover, most-repeated first.
 *
 * The evidence D5 retires questions on, and the reason `missing` is the one
 * part of a self-report that is kept. Counted across runs because a gap named
 * once is an anecdote and a gap named five times is a question we are not
 * asking.
 *
 * Case-folded and trimmed, because "the vendor headcount" and "The vendor
 * headcount" are one gap and counting them apart would hide the very signal
 * this exists to surface.
 */
export function missingTally(report: ReportState | undefined): { item: string; count: number }[] {
  const seen = new Map<string, { item: string; count: number }>();
  for (const run of report?.runs ?? []) {
    for (const raw of run.missing ?? []) {
      const item = raw.trim();
      if (!item) continue;
      const key = item.toLowerCase();
      const hit = seen.get(key);
      if (hit) hit.count += 1;
      else seen.set(key, { item, count: 1 });
    }
  }
  return [...seen.values()].sort((a, b) => b.count - a.count || a.item.localeCompare(b.item));
}
