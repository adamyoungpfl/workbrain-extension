import type { CueVerbName } from './engine';
import './verbs.css';

/**
 * The five DOM-marking verbs (`point` is Pointer.tsx — an overlay, not a
 * class on the target, so it isn't here) — R1-08. Every verb takes the list
 * of elements a target name resolved to, per docs/ARCHITECTURE.md: "verbs
 * resolve targets through a registry," plural, because the design mock
 * applies `sweep` to a whole row of pills at once.
 *
 * Real CSS keyframes/durations live in verbs.css, ported from
 * docs/design-system.html §06 (the binding source for the exact numbers).
 * Reduced motion is enforced twice, deliberately: verbs.css's own
 * `@media (prefers-reduced-motion: reduce)` block matches the design doc
 * for a real browser, and every verb here *also* reads the same preference
 * itself and sets the still form as an inline style. The second copy is
 * not redundant engineering for its own sake — it's what makes the still
 * state something a jsdom test can assert directly (verbs.test.ts) without
 * depending on a real CSS cascade, which is exactly the gap RELEASE-1's
 * accept criteria call out ("not just that the animation class is absent").
 */

/** The one place any verb reads the OS/browser's motion preference — not
 * injected as a parameter (unlike the storage client's chrome.* exception),
 * because a cue can play again later in the same session and must reflect
 * whatever the preference is *at that moment*, not whatever it was when the
 * chain first mounted. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

const CUE_CLASSES = ['cue-sweep', 'cue-ring', 'cue-ring-v', 'cue-bob'] as const;

function stripCueMarks(el: HTMLElement): void {
  el.classList.remove(...CUE_CLASSES, 'cue-reduced');
  el.style.removeProperty('box-shadow');
  el.style.removeProperty('--cue-stagger');
}

/** Clears cue marks from exactly `elements` — nothing else. This is what
 * `useCueChain.ts` actually uses as the chain runner's `clearAll`: a chain
 * only ever undoes what *it itself* marked on the previous link, tracked as
 * it goes, never anything wider. Scoping it this tightly is not a
 * micro-optimisation — an earlier version of this file's `clearAll` swept
 * the whole document instead (see `clearAllCueMarks` below) and a real
 * two-chains-on-one-page Playwright run (tests/e2e/cues.spec.ts) caught it
 * immediately: a *second* chain's very first `clearAll`, before it had
 * marked anything of its own, silently erased the *first* chain's still-live
 * mark. Nothing in a synthetic single-chain fixture would ever exercise that
 * — see the R1-08 report for the fuller account. */
export function clearCueMarks(elements: Iterable<HTMLElement>): void {
  for (const el of elements) stripCueMarks(el);
}

/** Clears every mark any verb in this file can apply, anywhere under `root`
 * — a broader, document-wide reset. Kept as a general-purpose utility (and
 * exercised directly in verbs.test.ts) but deliberately *not* what the
 * chain runner uses for its own per-link `clearAll` — see `clearCueMarks`'s
 * comment for why that would be wrong once more than one chain can be
 * live on the page at once. */
export function clearAllCueMarks(root: ParentNode = document): void {
  for (const cls of CUE_CLASSES) {
    root.querySelectorAll<HTMLElement>(`.${cls}`).forEach(stripCueMarks);
  }
}

/** sweep — "pick from this row." Full motion: a tint chases across each
 * element, staggered 150ms apart so a row reads as one sweep, not several
 * independent ones. Reduced motion: design-system.html turns the moving
 * tint into a fixed one; the inline box-shadow here is that fixed tint,
 * using the same colour (rgba of `--primary`) the design doc's own
 * reduced-motion CSS applies to the sweep's pseudo-element. */
export function sweep(elements: HTMLElement[]): void {
  const reduced = prefersReducedMotion();
  elements.forEach((el, i) => {
    el.classList.add('cue-sweep');
    el.style.setProperty('--cue-stagger', `${i * 0.15}s`);
    if (reduced) {
      el.classList.add('cue-reduced');
      el.style.boxShadow = '0 0 0 3px rgba(42, 79, 203, 0.16)';
    }
  });
}

/** ring — "press this." Reduced motion: a fixed halo instead of a pulsing
 * one, matching design-system.html §06's own reduced-motion value exactly. */
export function ring(elements: HTMLElement[]): void {
  const reduced = prefersReducedMotion();
  elements.forEach((el) => {
    el.classList.add('cue-ring');
    if (reduced) {
      el.classList.add('cue-reduced');
      el.style.boxShadow = '0 0 0 4px rgba(42, 79, 203, 0.2)';
    }
  });
}

/** ringViolet — "this is your AI's [turn]," the violet twin of `ring` used
 * on the hand-off step. Same treatment, the violet token's RGB. */
export function ringViolet(elements: HTMLElement[]): void {
  const reduced = prefersReducedMotion();
  elements.forEach((el) => {
    el.classList.add('cue-ring-v');
    if (reduced) {
      el.classList.add('cue-reduced');
      el.style.boxShadow = '0 0 0 4px rgba(106, 63, 209, 0.18)';
    }
  });
}

/** bob — "take this with you." design-system.html's own reduced-motion CSS
 * only turns the animation off here (`.cue-bob{animation:none}`), reasoning
 * that the button's existing emphasis styling already carries the
 * instruction. That's true for the specific "Download" example in the
 * design doc, but not guaranteed for every future caller of this verb, and
 * docs/GUARDRAILS.md's accessibility floor is unconditional: "the still
 * version still carries the instruction" for *every* cue. So this adds a
 * static ring as bob's own replacement mark — the same box-shadow value
 * Pill.css already uses for `.pill.suggested`, reused here rather than
 * inventing a new one. A deliberate, documented extension beyond the design
 * doc's literal CSS; see the R1-08 report for the reasoning in full. */
export function bob(elements: HTMLElement[]): void {
  const reduced = prefersReducedMotion();
  elements.forEach((el) => {
    el.classList.add('cue-bob');
    if (reduced) {
      el.classList.add('cue-reduced');
      el.style.boxShadow = '0 0 0 3px var(--primary-tint)';
    }
  });
}

/** focus — "type here." Reuses Field.css's existing static `.field:focus`
 * treatment (border-color + box-shadow) by literally moving DOM focus to
 * the target, exactly as the brief specifies: "nothing to disable for
 * reduced motion there," since that ring was never animated. Only the
 * first resolved element is meaningful to focus — unlike the other verbs,
 * "a whole row" doesn't apply here. */
export function focus(elements: HTMLElement[]): void {
  elements[0]?.focus({ preventScroll: true });
}

/** Dispatches a parsed cue to the right verb by name. `point` is
 * intentionally a no-op here — see Pointer.tsx and useCueChain.ts, which
 * track it as overlay state instead of a DOM class. */
export function applyCueVerb(verb: CueVerbName, elements: HTMLElement[]): void {
  switch (verb) {
    case 'sweep':
      sweep(elements);
      return;
    case 'ring':
      ring(elements);
      return;
    case 'ringViolet':
      ringViolet(elements);
      return;
    case 'bob':
      bob(elements);
      return;
    case 'focus':
      focus(elements);
      return;
    case 'point':
      return;
  }
}
