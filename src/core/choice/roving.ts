/**
 * V2.0 VB-60 — THE CHOICE GROUP'S KEYBOARD CONTRACT, AS ONE FUNCTION.
 *
 * ── WHY THIS FILE EXISTS AT ALL ───────────────────────────────────────────
 *
 * `components/Pill.tsx`'s `PillGroup` has shipped since R1 with a roving
 * tabindex, arrow keys that move between options, Home/End, Space to select,
 * and a real `role="group"` named by the question. That is not a nice touch —
 * it is the composite widget pattern the whole interview's keyboard path is
 * built on, and docs/GUARDRAILS.md names it directly: "Full keyboard path
 * through every flow. **Arrow keys within pill groups.**"
 *
 * VB-60 replaces that group with a different-looking one on the roles
 * question. The task's own words: "PillGroup is a shipped accessibility
 * contract — whatever replaces it keeps ALL of that." The cheap way to obey
 * that sentence is to copy twenty lines of `switch (e.key)` into the new
 * component and check it by eye. The cheap way is also how the two drift: one
 * of them gains PageUp, or loses Home, or wraps in a different direction, and
 * a person who learned the keyboard on one question finds it does something
 * else on the next.
 *
 * So the contract is a pure function, both groups call it, and it is tested
 * once without a browser. "Whatever replaces it keeps all of that" stops being
 * a claim in a commit message and becomes a fact about the call graph.
 *
 * ── WHAT IS AND IS NOT HERE ──────────────────────────────────────────────
 *
 * Here: which index a key moves to, and what a press does to the selection.
 * Both are arithmetic over values, which is why they can be tested at all.
 *
 * Not here: focus. Moving focus is a DOM act and belongs to the component
 * (CLAUDE.md's one architectural rule). This module says *where* to go; the
 * component is what calls `.focus()` on the thing it finds there.
 */

/**
 * The next index a key moves the roving tabindex to, or `null` when the key is
 * not one this pattern claims.
 *
 * `null` rather than "the index you already had" on purpose: the caller has to
 * be able to tell "move to where you already are" from "this key is not mine,
 * leave it to the browser". Space and Enter are the second kind — they are
 * native `<button>` activation and must never be intercepted here, or a group
 * would have to reimplement what pressing a button means.
 *
 * BOTH AXES MOVE THE SAME GROUP. Right/Down go forward, Left/Up go back.
 * The options wrap on screen — a "row" of them is a row and a half at 400px —
 * so there is no meaningful difference between the two axes to preserve, and a
 * group where Down does nothing is a group somebody gets stuck in.
 *
 * It wraps at both ends, which is what makes End reachable from the start with
 * one key and is how the pattern has behaved since R1.
 */
export function rovingTarget(key: string, index: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return wrap(index + 1, count);
    case 'ArrowLeft':
    case 'ArrowUp':
      return wrap(index - 1, count);
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/** Every key the pattern claims, in one place, so a test can walk the list
 * rather than trust that six cases were all remembered — the same reason
 * `core/motion/rotation.ts` publishes `ROTATION_INTERACTIONS`. */
export const ROVING_KEYS: readonly string[] = [
  'ArrowRight',
  'ArrowDown',
  'ArrowLeft',
  'ArrowUp',
  'Home',
  'End',
] as const;

function wrap(index: number, count: number): number {
  return ((index % count) + count) % count;
}

/**
 * What one press does to the selection.
 *
 * `multi` toggles and keeps the order the person picked things in — which is
 * the order the roles loop then walks them in (`seedFrom` in
 * core/flow/runner.ts), so appending rather than re-sorting is load-bearing
 * and not merely tidy.
 *
 * `single` replaces. It does NOT deselect on a second press: the question is
 * required-ish, the person has no other way back to "nothing picked", and a
 * pill that empties itself when you press it twice reads as a bug.
 */
export function toggleChoice(
  values: readonly string[],
  value: string,
  mode: 'single' | 'multi',
): string[] {
  if (mode === 'single') return [value];
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}
