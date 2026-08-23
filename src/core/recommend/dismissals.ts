import type { Dismissals } from '../../schema/storage.types';
import type { Recommendation } from './types';

/**
 * V1.5 VB-28 — THE ONE THING THIS FEATURE PERSISTS, AND WHY.
 *
 * docs/ARCHITECTURE.md's rule is flat: "Nothing derived is stored." Every
 * recommendation this engine makes obeys it — they are recomputed from
 * `wb:answers` on every render, exactly like `findPosition`, `computeNextMove`
 * and `sectionHealthMap`, and there is no recommendation record anywhere that
 * could drift out of agreement with the answers that produce it.
 *
 * A DISMISSAL IS NOT DERIVED. It is a decision the person made, about an
 * offer, and it exists nowhere else. VB-28's third constraint says the person
 * "must be able to ignore them permanently without the product re-raising
 * them", and there is no way to honour "permanently" by recomputation: the
 * gap that produced the recommendation is still there — that is the whole
 * point of dismissing it. So it goes in storage, deliberately, as its own
 * small key, and this comment is the justification the rest of the codebase
 * is entitled to.
 *
 * ── The shape, and why it is a map of dates ───────────────────────────────
 *
 * `Record<recommendationId, isoDate>` rather than a `string[]`. The date
 * costs twenty bytes and answers the question VB-28 lists as still open —
 * "whether dismissal is permanent or seasonal" — without having to ask
 * anybody to re-dismiss anything if the answer ever comes back "seasonal".
 * Today it is permanent (see `activeDismissals`); a seasonal policy is a
 * filter over data that is already here rather than a migration.
 *
 * ── Nothing is pruned ─────────────────────────────────────────────────────
 *
 * A dismissal for a recommendation that no longer fires is kept, not swept
 * up. If somebody hides "most people name three or four here", names a
 * second person, and later drops back to one, sweeping the record would
 * re-raise the exact offer they turned down — which is the behaviour the
 * constraint forbids. The whole map is at most a few dozen short keys.
 *
 * ── Local, not sync ───────────────────────────────────────────────────────
 *
 * `wb:recs` is a `chrome.storage.local` key. A dismissal is about the answers
 * on THIS device, and docs/ARCHITECTURE.md caps `sync` at preferences for
 * good reasons; a dismissal is not a preference, it is a fact about one file.
 */

/** An empty, valid state — what a fresh install and a failed read both mean. */
export const NO_DISMISSALS: Dismissals = { dismissed: {} };

/** Never throws on a missing or half-written key: absent reads as empty, and
 * an empty dismissal map means every recommendation is on offer, which is the
 * correct behaviour for a fresh install (docs/GUARDRAILS.md, degradation). */
export function readDismissals(stored: Dismissals | undefined): Dismissals {
  if (!stored || typeof stored.dismissed !== 'object' || stored.dismissed === null) return NO_DISMISSALS;
  return stored;
}

/**
 * The ids currently in force.
 *
 * Permanent today — every recorded dismissal counts, whatever its date. The
 * seam is here rather than at the call sites so that if "seasonal" is ever
 * chosen, one function changes and nothing else does.
 */
export function activeDismissals(state: Dismissals): ReadonlySet<string> {
  return new Set(Object.keys(state.dismissed));
}

export function isDismissed(state: Dismissals, id: string): boolean {
  return id in state.dismissed;
}

/** Immutable, like every `apply*` in core/flow/runner.ts. Re-dismissing an
 * already-dismissed id keeps the FIRST date: when they turned it down is the
 * fact worth keeping, and a re-render must never look like a new decision. */
export function dismiss(state: Dismissals, id: string, now: Date): Dismissals {
  if (id in state.dismissed) return state;
  return { dismissed: { ...state.dismissed, [id]: now.toISOString() } };
}

/** Undismiss. Nothing in the panel calls this today — there is no settings
 * page to put it on (docs/GUARDRAILS.md) — but the engine's own tests need
 * to prove a dismissal is a filter and not a deletion, and a one-way door
 * with no handle on the inside is worth avoiding in stored state. */
export function restore(state: Dismissals, id: string): Dismissals {
  if (!(id in state.dismissed)) return state;
  const next = { ...state.dismissed };
  delete next[id];
  return { dismissed: next };
}

/** The filter itself, kept beside the state it reads so no caller has to
 * remember which direction the test runs in. */
export function withoutDismissed(
  recommendations: readonly Recommendation[],
  dismissed: ReadonlySet<string>,
): Recommendation[] {
  return recommendations.filter((r) => !dismissed.has(r.id));
}
