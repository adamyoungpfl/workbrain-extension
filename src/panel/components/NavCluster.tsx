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
 * than a limitation of CSS. Advancing replaces the whole question in one
 * commit: the outgoing buttons are gone from the document in the very frame
 * the incoming ones arrive. There is nothing left on screen to melt.
 *
 * **So the outgoing cluster leaves a copy of itself behind.** Each cluster
 * photographs its own controls as it arrives, and when the question changes
 * that photograph goes into a layer that outlives it (`.flow-melt`, rendered
 * once by `Flow` beside the drawer) and sinks into the bar. The real controls
 * — the next question's, already mounted, already pressable — rise out of it
 * behind the copy. What a person sees is one cluster melting and reforming.
 * What the DOM is doing is a ghost going flat while the live thing comes up
 * behind it.
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
 *  · The incoming cluster is the real one from frame zero. Its ink has no
 *    height until that control's turn in the wave comes round
 *    (`animation-fill-mode: backwards` on a flattened first frame), and a
 *    button whose ink has no height is still a button: it hit-tests, it takes
 *    Enter, it submits. The V2.0 stagger makes that wait longer for the
 *    controls further right — Skip's ink is flat for 140ms rather than 80 —
 *    and it costs nothing, because the wait was never a gate. The e2e proves
 *    it the hard way: it presses Next while every control is still flat.
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
 * each copy removes itself when its own animation ends — its own, not the
 * cluster's, which is what keeps the wave's copies from waiting on each other
 * when a press lands in the middle of one.
 *
 * ── WHAT MAKES IT PLAY: THE CUE, NOT A REMOUNT ───────────────────────────
 * V1.9 hung the whole gesture off this component's own mount and unmount, with
 * an empty dependency array, which works only for as long as somebody else
 * keeps remounting it. It does today — `Flow` keys both `StepView` and
 * `ModuleIntro` by `positionKey(position)` — and the gesture measurably plays
 * on every question because of it. But that is an invariant owned by another
 * file, invisible from this one, and Adam's requirement is stated on the
 * question rather than on the mount: *"a quick but visibly detectable
 * animation on each page change … even if it happens to be the same kind as
 * the last."*
 *
 * So the trigger is now the thing the requirement is about. `cue` is the
 * position key, and the effect depends on it — `BrandMark`'s `spinCue`, which
 * is where this panel already keeps "play when this value changes". A new
 * question plays the gesture whether the cluster was rebuilt or merely
 * re-rendered, and it plays even when the same three controls are valid again,
 * because the cue changed and the cue is what a page change *is*.
 *
 * One difference from `BrandMark`, and it is deliberate: that component
 * remembers its cue at module scope so a remount *inside* one module does not
 * restart the turn. This one does not remember. Suppressing a repeat is what
 * that memory is for, and here every remount is a real change of what the bar
 * offers — the reflect screen swaps its whole cluster without the position
 * moving — so the memory would filter out gestures that should play. The cue
 * adds a trigger; it takes none away.
 *
 * ── WHY THE COPIES ARE TAKEN ON THE WAY IN ───────────────────────────────
 * The copies that sink are made when the cluster *arrives*, not when it
 * leaves, and held until the cue changes. Cloning on the way out only works if
 * the way out is an unmount, because that is the one moment React still has
 * the old buttons in the document; on a cue change without a remount the DOM
 * has already been updated by the time a cleanup runs, and the ghost would be
 * a copy of the cluster that just arrived. Taking the snapshot on the way in
 * is correct for both, and it is correct here for a reason worth stating: the
 * controls a cluster shows never change during its life. Which of Back, Next
 * and Skip are rendered depends on `canGoBack`, on the step's kind and on the
 * position — all fixed for as long as one cluster is on screen.
 *
 * ── prefers-reduced-motion ───────────────────────────────────────────────
 * The buttons simply change. No melt, no rise, and — the part that is easy to
 * get wrong — *nothing scheduled*: the preference is read at both ends of the
 * gesture, before a copy is put on screen and before a class is added, so
 * under it no ghost ever enters the document, no class is ever added and no
 * animation ever exists to be cancelled. The snapshot above is still taken,
 * and that is deliberate rather than an oversight: it is three detached
 * elements that are never inserted, never painted and never measured, and
 * taking it unconditionally is what lets the preference change mid-interview
 * without the next gesture finding it has nothing to melt. What the
 * reduced-motion spec watches for is what actually matters — every child ever
 * added to the layer, every class ever applied, every animation ever
 * scheduled — and all three stay at zero. The end state is identical, which is
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

/**
 * Where a control stands in its cluster, counted from the left, published to
 * the stylesheet as a custom property.
 *
 * This is the whole of the V2.0 wave as far as the panel is concerned: the
 * delay is `index × --nav-stagger`, and Flow.css does that multiplication
 * because a delay is a duration and durations live in the stylesheet. The
 * index has to be written by script rather than derived in CSS — `nth-child`
 * cannot count `.navbtn` elements that a `<form>` interleaves with other
 * children, and the ghost layer's copies are not children of anything CSS
 * could count them in.
 */
export const NAV_INDEX_PROP = '--nav-i';

/** The controls inside a cluster, in the order they stand. */
function controlsIn(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(`.navbtn[${NAV_CONTROL_ATTR}]`)];
}

/** Stamps each control with its place in the wave. Both clusters get it, and
 * they get it from the same function, so a copy can never be a frame out of
 * step with the control it is a copy of. */
function stampOrder(controls: readonly HTMLElement[]): void {
  controls.forEach((control, index) => control.style.setProperty(NAV_INDEX_PROP, String(index)));
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
 * The copies that will sink, taken while the cluster they copy is on screen.
 *
 * Made on the way in and kept until the cue changes — see the file header on
 * why the snapshot cannot be taken on the way out any more. Nothing is
 * scheduled here and nothing is put in the document; this is a photograph.
 *
 * The copies are inert in three ways at once, because one of them is not
 * enough for a `<button>`: the layer takes no pointer events (Flow.css), it is
 * `aria-hidden`, and every control inside it is taken out of the tab order.
 * A clone carries no React fiber either, so even a click that somehow reached
 * one would find no handler to run.
 */
function copiesOf(foot: HTMLElement): HTMLElement[] {
  return controlsIn(foot).map((control) => {
    const copy = control.cloneNode(true) as HTMLElement;
    for (const focusable of copy.querySelectorAll<HTMLElement>('button, a, input, [tabindex]')) {
      focusable.tabIndex = -1;
    }
    return copy;
  });
}

/** The way out: put the copies in the layer and let them sink. */
function meltIntoBar(layer: HTMLElement, copies: readonly HTMLElement[]): void {
  if (prefersReducedMotion()) return;
  if (copies.length === 0) return;

  // Restart cleanly: a press that lands mid-melt replaces the copy rather
  // than stacking a second one on top of it.
  layer.replaceChildren();
  layer.append(...copies);
  stampOrder(copies);
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

  stampOrder(arriving);
  restart(arriving, NAV_RISE_CLASS, foot);
}

export interface NavClusterProps {
  /**
   * What counts as a page change: the position key, from `Flow`.
   *
   * Change it and the cluster melts and reforms — including when the very
   * same three controls are valid again, which is the common case and the one
   * V1.9 was never seen to play. Left undefined outside the interview (the
   * proof loop's footer), where there is no drawer to melt into and nothing
   * is ever scheduled.
   */
  cue?: string;
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
export function NavCluster({ cue, children }: NavClusterProps) {
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
    // Photographed after the rise, so a copy is dressed exactly as the
    // control it copies was — the same classes, the same place in the wave.
    const copies = copiesOf(foot);

    // React runs a deleted tree's layout cleanups in the mutation phase and
    // the incoming tree's layout effects after it, so this fires BEFORE the
    // next cluster's rise — which is the ordering the whole gesture depends
    // on, and the reason the ghost is already in place when the plan above
    // is computed. On a cue change without a remount the same order holds:
    // React runs the cleanup for a changed dependency before re-running the
    // effect, and the copies above were taken while this cluster was on
    // screen rather than after it had been replaced.
    return () => {
      if (layer) meltIntoBar(layer, copies);
    };
  }, [cue]);

  return (
    <footer className="flow-foot" ref={ref}>
      {children}
    </footer>
  );
}
