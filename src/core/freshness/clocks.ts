/**
 * Pure time math for freshness — no chrome.*, no DOM (docs/ARCHITECTURE.md
 * names this file in the module map). `now` is always an injected
 * parameter, never read internally (no bare `new Date()` inside these
 * functions), so every case in clocks.test.ts is a real, repeatable
 * assertion rather than a snapshot of whatever day the test happened to
 * run on — the same discipline core/flow/runner.test.ts holds itself to.
 *
 * R1-12's own brief is explicit about scope here: the only real ported
 * durability signal is `role_durability`, and it is a bare current/historical
 * flag — no ported question ever captures a stated duration like "a year"
 * (grep core/flow/source.ts). So there is exactly one clock, not a family of
 * them: how long since a "current" answer was actually given. The one
 * concrete duration this product has actually settled on anywhere is
 * docs/workbrain-spec.html's own number for content that has gone untouched
 * — six months — so that's what's reused here rather than inventing a new
 * one. This is a scheduling number for the freshness *badge*, computed at
 * render time from stored answers — not the drift-check notification
 * mechanism, which is out of scope for all of Release 1 (docs/RELEASE-1.md).
 */

export const DUE_AFTER_DAYS = 182; // ~6 months

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days between an ISO `answeredAt` and `now`. A bad system clock or
 * an `answeredAt` written in the future clamps to zero rather than
 * reporting a negative age — there is no such thing as "due in the past". */
export function daysSince(answeredAt: string, now: Date): number {
  const ms = now.getTime() - new Date(answeredAt).getTime();
  return Math.max(0, Math.floor(ms / DAY_MS));
}

/** `>=` the threshold, not `>` — an answer given exactly `thresholdDays` ago
 * is due today, not tomorrow. See clocks.test.ts for the boundary itself. */
export function isDue(answeredAt: string, now: Date, thresholdDays: number = DUE_AFTER_DAYS): boolean {
  return daysSince(answeredAt, now) >= thresholdDays;
}

export type ElapsedUnit = 'day' | 'month' | 'year';
export interface Elapsed {
  value: number;
  unit: ElapsedUnit;
}

/** Rough, human-scale elapsed time for copy — not calendar-exact, matching
 * the granularity strings.ts already uses elsewhere for a file's own age
 * (`daysOld`, e.g. "42 days old"). Freshness never needs to be exact to the
 * day once it's already past the "days" range. */
export function roughElapsed(days: number): Elapsed {
  if (days < 30) return { value: days, unit: 'day' };
  if (days < 365) return { value: Math.round(days / 30), unit: 'month' };
  return { value: Math.round(days / 365), unit: 'year' };
}
