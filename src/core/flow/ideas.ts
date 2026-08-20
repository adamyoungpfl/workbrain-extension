import type { Step } from '../../schema/flow.types';

/**
 * V1.1 VB-08 — the "give me an example" button, minus the button.
 *
 * `Step.ideas` has been in the data since the questions were ported (R1-05):
 * 22 questions carrying 94 written starter answers, none of them rendered
 * anywhere until now. This module holds the only two decisions involved —
 * *which* questions offer them, and *which one* a given press produces — as
 * pure functions, so both are tested without a browser and neither can drift
 * into being re-derived inside a click handler.
 *
 * There is no AI here and there never will be. An "idea" is static content
 * shipped in the bundle; pressing the button is a local array lookup. That is
 * the whole point of the feature — someone stuck at a blank box gets a real
 * sentence to react to, instantly, offline, with nothing sent anywhere.
 */

/** Shared empty array, so `ideasFor` returning "none" is a stable reference
 *  and never a new allocation on every render. */
const NONE: readonly string[] = [];

/**
 * The starter answers a step offers, or none.
 *
 * `text` only, deliberately. Two other kinds could technically hold `ideas`
 * and must not offer them: a `gen` step's field is where the person pastes
 * what their *own* AI said (R1-11's proof loop), and pre-filling that with
 * something the panel wrote would put words in the AI's mouth and quietly
 * corrupt the one measurement in the product. Choice-shaped steps already
 * show every answer they accept. As it happens no non-text question carries
 * `ideas` in the ported data either — asserted in ideas.test.ts, so this
 * stays a guarantee rather than a coincidence.
 */
export function ideasFor(step: Pick<Step, 'kind' | 'ideas'>): readonly string[] {
  if (step.kind !== 'text') return NONE;
  return step.ideas?.length ? step.ideas : NONE;
}

/**
 * Which idea the next press produces, given how many presses came before it.
 *
 * Zero presses so far means the first idea, and the count keeps climbing —
 * the caller never has to know the list's length or where the wrap is.
 * `reference_example_primary` carries ten of these and rapid repeat pressing
 * is the normal way to read through them, so the eleventh press returning the
 * first idea again (rather than nothing, or the last one forever) is the
 * behaviour that makes the control feel like a list you can flick through.
 *
 * Returns null only for a step with no ideas at all, which is the same
 * condition that stops the button being rendered — so the null branch is
 * unreachable through the UI and exists to keep the function total.
 */
export function ideaAt(ideas: readonly string[], pressCount: number): string | null {
  if (ideas.length === 0) return null;
  // A press count is a count: floor it and fold negatives forward rather than
  // trusting the caller, since `% ` on a negative is negative in JS and would
  // index off the front of the array.
  const n = Math.floor(Number.isFinite(pressCount) ? pressCount : 0);
  const index = ((n % ideas.length) + ideas.length) % ideas.length;
  return ideas[index] ?? null;
}
