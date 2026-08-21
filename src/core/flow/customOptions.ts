import type { Option, Step } from '../../schema/flow.types';

/**
 * V1.4 VB-20 — the pills a select question needs that its own data does not
 * carry.
 *
 * A multi-select's answer can hold values that are not among its options: "+
 * add your own" puts them there, and so does naming a new role at the end of
 * the roles loop (core/flow/runner.ts's `applySeededAddAnother`). Those values
 * are stored; the option that would render them is not, because nothing
 * derived is stored (docs/ARCHITECTURE.md). So the pill is derived back from
 * the answer, here, every time the question is shown.
 *
 * Without this, coming Back to `role_names` shows a role that is selected but
 * has no pill: invisible, and impossible to deselect. The answer survives
 * (it stays in the draft, and re-submitting keeps it), so this is not a
 * data-loss bug — but "your added role is not on the list you just added it
 * to" is exactly the kind of quiet wrongness that makes someone distrust the
 * file.
 *
 * Value and label are the same string: an off-list value was typed by the
 * person, so it is already the words they would recognise. That is also what
 * `reconcileSeededRepeatable` assumes when it falls back to the raw value for
 * a name it has no option for.
 *
 * Order follows `selected`, so a newly added name lands at the end of the row
 * — where it was added, and where the eye last was.
 */
export function offListOptions(step: Step, selected: string[]): Option[] {
  if (step.kind !== 'multi' && step.kind !== 'chips') return [];
  const known = new Set((step.options ?? []).map((o) => o.v));
  const seen = new Set<string>();
  const extra: Option[] = [];
  for (const value of selected) {
    if (known.has(value) || seen.has(value)) continue;
    seen.add(value);
    extra.push({ v: value, l: value });
  }
  return extra;
}
