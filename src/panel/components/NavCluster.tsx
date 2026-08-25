import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { navMeltPlan } from '../../core/flow/navMelt';
import { prefersReducedMotion } from '../cues/verbs';

/**
 * V1.9 VB-53 — the band Back / Next / Skip stand in, and the melt it plays.
 *
 * "On advancing, the nav buttons melt down into the bar, and only the buttons
 * valid for the next question rise back out to reform. A living panel rather
 * than a static one." (docs/V1.9-REFINEMENT.md)
 *
 * ── WHY A COMPONENT AND NOT A STYLESHEET ─────────────────────────────────
 * A CSS-only answer cannot exist here, and the reason is structural rather
 * than a limitation of CSS. `StepView` is keyed by position (Flow.tsx), so
 * advancing is an unmount and a mount in the same commit: the outgoing
 * buttons are gone from the document in the very frame the incoming ones
 * arrive. There is nothing left on screen to melt.
 *
 * **So the outgoing cluster leaves a copy of itself behind.** On the way out
 * this component clones its own controls into a layer that outlives it
 * (`.flow-melt`, rendered once by `Flow` beside the drawer) and that copy is
 * what sinks into the bar. The real controls — the next question's, already
 * mounted, already pressable — rise out of it 80ms later. What a person sees
 * is one cluster melting and reforming. What the DOM is doing is a ghost
 * fading down while the live thing comes up behind it.
 *
 * ── THE RULE THAT MATTERS MOST: IT NEVER GATES INPUT ─────────────────────
 * Forty-nine questions is forty-nine melts, so the only unforgivable
 * behaviour here is a button that is not pressable yet.
 *
 *  · Nothing in this file touches the commit path. There is no timer between
 *    a press and the answer being stored, no `disabled`, no "wait for the
 *    animation" — the melt is played by a layout effect *after* the next
 *    question has already rendered, and it plays whether or not anyone is
 *    looking at it.
 *  · **Nothing pressable moves.** What animates is `.navbtn-face`, a box
 *    holding the word and its chevron *inside* the button
 *    (components/NavButton.tsx). The 44px target keeps its size and its line
 *    for the whole gesture, so a press lands wherever in it a person aims,
 *    however far through the melt they are — and V1.2 VB-10's promise that
 *    nothing on screen moves while a question prints survives a cue that now
 *    plays on every advance. That is not a nicety: the first build of this
 *    task moved the button and VB-10's own e2e caught it.
 *  · The incoming cluster is the real one from frame zero. It has no height
 *    for 80ms (`animation-fill-mode: backwards` on a flattened first frame),
 *    and a button whose ink has no height is still a button: it hit-tests, it
 *    takes Enter, it submits.
 *  · It flattens rather than fades — see core/flow/navMelt.ts, which holds the
 *    reason. No frame of this gesture paints text under the contrast floor.
 *
 * VB-10's typewriter holds exactly this line for the question text, and its
 * e2e proves it by typing during the print. tests/e2e/nav-melt.spec.ts proves
 * this one the same way: it presses Next in the middle of the melt and reads
 * the answer back out of the person's own storage.
 *
 * ── INTERRUPTION ─────────────────────────────────────────────────────────
 * Two presses in quick succession, or Back landing mid-melt, must not leave a
 * wrong or missing control. Both halves restart from the beginning rather
 * than queueing, VB-04's rule exactly (Flow.tsx's `restartCue`): remove the
 * class, force a reflow so the removal is committed, add it back. The ghost
 * layer is emptied before the new copies go in, so ghosts cannot stack, and
 * each copy removes itself when its own animation ends.
 *
 * ── prefers-reduced-motion ───────────────────────────────────────────────
 * The buttons simply change. No melt, no rise, and — the part that is easy to
 * get wrong — *nothing scheduled*: the preference is read before anything is
 * cloned, so under it no ghost is ever created, no class is ever added and no
 * animation ever exists to be cancelled. The end state is identical, which is
 * the whole of the still equivalent here: the information this cue carries is
 * "these are the controls now", and under the preference they are the
 * controls now from the first frame.
 */

/** The layer the outgoing copies sink in. Rendered once by `Flow` inside
 * `.flowshell`, so it outlives every question; deliberately NOT given the
 * `.flow-foot` class, which several specs resolve as a single locator. */
export const NAV_MELT_LAYER_CLASS = 'flow-melt';

/** On a copy, while it sinks. */
export const NAV_MELT_CLASS = 'is-melting';

/** On a live control, while it comes back out. */
export const NAV_RISE_CLASS = 'is-rising';

/** How a control names itself to the melt. Set by the call sites in Flow.tsx
 * and ModuleIntro.tsx from the same condition that decides whether to render
 * the control at all — this file never decides which controls exist. */
export const NAV_CONTROL_ATTR = 'data-nav';

/** What became of a control across the swap, stamped on both clusters so the
 * rule VB-53 states is legible on the screen rather than inferred. */
export const NAV_FATE_ATTR = 'data-nav-fate';

/** The controls inside a cluster, in the order they stand. */
function controlsIn(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(`.navbtn[${NAV_CONTROL_ATTR}]`)];
}

function idOf(control: HTMLElement): string {
  return control.getAttribute(NAV_CONTROL_ATTR) ?? '';
}

/**
 * Plays a class from the start, however recently it last played — Flow.tsx's
 * `restartCue`, which VB-04 wrote for the rephrase press and VB-08 reuses.
 *
 * Kept as its own copy rather than imported from the surface because a
 * component importing a helper out of a surface inverts the dependency, and
 * because the reasoning is worth having next to the thing that needs it: the
 * second press inside 200ms is the interesting case, and simply leaving the
 * class on does nothing at all.
 */
function restart(elements: readonly HTMLElement[], cueClass: string, host: HTMLElement): void {
  for (const el of elements) el.classList.remove(cueClass);
  void host.offsetWidth;
  for (const el of elements) el.classList.add(cueClass);
}

/**
 * The way out: leave a copy behind and let it sink.
 *
 * The copies are inert in three ways at once, because one of them is not
 * enough for a `<button>`: the layer takes no pointer events (Flow.css), it is
 * `aria-hidden`, and every control inside it is taken out of the tab order.
 * A clone carries no React fiber either, so even a click that somehow reached
 * one would find no handler to run.
 */
function meltIntoBar(layer: HTMLElement, foot: HTMLElement): void {
  if (prefersReducedMotion()) return;
  const leaving = controlsIn(foot);
  if (leaving.length === 0) return;

  // Restart cleanly: a press that lands mid-melt replaces the copy rather
  // than stacking a second one on top of it.
  layer.replaceChildren();

  const copies = leaving.map((control) => {
    const copy = control.cloneNode(true) as HTMLElement;
    for (const focusable of copy.querySelectorAll<HTMLElement>('button, a, input, [tabindex]')) {
      focusable.tabIndex = -1;
    }
    return copy;
  });
  layer.append(...copies);
  restart(copies, NAV_MELT_CLASS, layer);
  for (const copy of copies) {
    copy.addEventListener('animationend', () => copy.remove(), { once: true });
  }
}

/**
 * The way back: the controls this question actually offers come out of the
 * bar, and nothing else does.
 *
 * The plan is computed here rather than on the way out because this is the
 * only moment both clusters are readable at once — the copies of the old one
 * are in the layer, the new one is in the document — and it is computed from
 * what is on the screen rather than from any list of controls. Stamping both
 * sides is what lets tests/e2e/nav-melt.spec.ts assert that Skip melted and
 * did not reform, instead of asserting that a class toggled.
 */
function riseFromBar(layer: HTMLElement | null, foot: HTMLElement): void {
  if (prefersReducedMotion()) return;
  const arriving = controlsIn(foot);
  if (arriving.length === 0) return;

  const leaving = layer ? controlsIn(layer) : [];
  const plan = navMeltPlan(leaving.map(idOf), arriving.map(idOf));
  const fates = new Map(plan.map((entry) => [entry.id, entry.fate]));
  for (const control of [...leaving, ...arriving]) {
    const fate = fates.get(idOf(control));
    if (fate) control.setAttribute(NAV_FATE_ATTR, fate);
  }

  restart(arriving, NAV_RISE_CLASS, foot);
}

export interface NavClusterProps {
  children?: ReactNode;
}

/**
 * The docked nav band. One element, one behaviour, every screen that has a
 * Back / Next / Skip to show.
 *
 * Outside `.flowshell` — the proof loop, which writes no file and has no
 * drawer to dock to — this is exactly the `<footer className="flow-foot">` it
 * has always been. There is no bar there for anything to melt into, so
 * nothing is cloned and nothing is scheduled; the markup, the tab order and
 * the ordinary footer treatment are unchanged.
 */
export function NavCluster({ children }: NavClusterProps) {
  const ref = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const foot = ref.current;
    if (!foot) return;
    // Only the docked cluster melts: `.flowshell` exists precisely where
    // there is a drawer to melt into (Flow.tsx's `withDrawer`).
    const shell = foot.closest('.flowshell');
    if (!shell) return;
    const layer = shell.querySelector<HTMLElement>(`.${NAV_MELT_LAYER_CLASS}`);

    riseFromBar(layer, foot);

    // React runs a deleted tree's layout cleanups in the mutation phase and
    // the incoming tree's layout effects after it, so this fires BEFORE the
    // next cluster's rise — which is the ordering the whole gesture depends
    // on, and the reason the ghost is already in place when the plan above
    // is computed.
    return () => {
      if (layer) meltIntoBar(layer, foot);
    };
  }, []);

  return (
    <footer className="flow-foot" ref={ref}>
      {children}
    </footer>
  );
}
