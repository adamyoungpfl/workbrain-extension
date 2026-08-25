/**
 * V1.9 VB-53 — the melt, as arithmetic.
 *
 * "On advancing, the nav buttons melt down into the bar, and only the buttons
 * valid for the next question rise back out to reform." (docs/V1.9-REFINEMENT.md)
 *
 * This file holds the two things about that which are not rendering: **how
 * long the gesture takes and how far it travels**, and **what happens to each
 * control across the swap**. Both are here rather than in the stylesheet or in
 * a component for the same reason `core/flow/dock.ts` holds the band's
 * geometry: they are sums with rules attached, and a sum in a `calc()` or a
 * keyframe percentage is a sum nobody can test.
 *
 * **It does not know which controls exist.** `Flow` already decides that —
 * Skip on a skippable question, Back when there is history — and VB-53 is
 * presentation over that existing truth, not a second source for it. What
 * arrives here is two lists of ids *observed from the two clusters themselves*
 * (the outgoing one, cloned, and the incoming one, rendered), and what leaves
 * is what became of each. Nothing in this file can invent a control that was
 * not on screen.
 *
 * ── V2.0: THE GESTURE HAS TO BE SEEN ─────────────────────────────────────
 * V1.9 shipped this in unison — every control melting and rising on the same
 * clock — and Adam's verdict on the built extension was "the melt is not
 * obvious at any point right now". The frames say why, and it is not that it
 * was too small: three words vanishing and coming back together read as one
 * blink of the whole band, and a blink is the one kind of motion the eye is
 * built to discard. It also left a window around 80ms where the band was very
 * nearly empty, which reads as a rendering fault rather than as a gesture.
 *
 * So the cluster now reforms as a **wave**: each control runs the identical
 * 200ms gesture, `NAV_MELT_STAGGER_MS` after the one to its left. Nothing
 * about a single control's motion changed except how far its ink travels
 * (`NAV_MELT_DROP`, 14 → 20, still inside the three bounds below). What
 * changed is that the cluster is now *sequenced*, so at every moment one
 * control is leaving while another is still standing — the band is never
 * blank, there is always a stationary word to see the moving one against, and
 * the thing on screen is direction rather than a flicker.
 *
 * ── WHY THE NUMBERS ARE WHAT THEY ARE ────────────────────────────────────
 * This sits on the path of every single answer. Forty-nine questions is
 * forty-nine melts, so the rules that matter are not about how it looks:
 *
 *  1. **It never gates input.** Next is pressable the instant the next
 *     question is readable — the incoming cluster is real, mounted and
 *     hit-testable from frame zero (the panel never disables it, never waits
 *     on an event, never schedules the commit). **Nothing pressable moves at
 *     all**: only the control's ink travels, inside a 44px box that stays
 *     exactly where it was, so a press aimed at a control mid-gesture lands on
 *     it however far through the gesture it is. `NAV_MELT_DROP` is held under
 *     half that box so the ink never leaves the control it belongs to, and
 *     navMelt.test.ts is what keeps it there.
 *  2. **It is short.** `docs/design-system.html` §06 gives 200ms as the
 *     default for anything that moves, and a melt-and-rise that reads as
 *     ceremony at 200ms reads as a delay at 400. **A control still moves for
 *     exactly 200ms** — that number did not change and is not allowed to —
 *     and every duration inside it is one the design system already names:
 *     two `--fast` halves overlapped into one `--base` whole. The wave's own
 *     length is the only new duration and it is not a bespoke one either: a
 *     full three-control cluster reforms in `--slow`, the longest §06 names,
 *     and `NAV_MELT_STAGGER_MS` is derived backwards from that so it cannot
 *     drift. Two controls take 260ms and one takes 200.
 *  3. **No frame of it paints faint text.** There is deliberately no opacity
 *     term anywhere in this gesture, and that is an accessibility decision
 *     rather than a stylistic one. `docs/GUARDRAILS.md` sets an unconditional
 *     4.5:1 floor for text; a word cross-fading to nothing passes through
 *     every ratio below it on the way, and axe reads exactly that if it
 *     samples the panel mid-advance — which it does, because
 *     tests/e2e/dictation-hint.spec.ts runs its sweep straight after an
 *     answer. So the cluster leaves and returns by *flattening* instead: full
 *     colour at every frame, and gone because it has no height rather than
 *     because it has no contrast.
 */

import { FLOW_NAV_MAX_CONTROLS, FLOW_NAV_TARGET, navPaintGapAboveDrawer, navPaintHeight } from './dock';

/**
 * The whole gesture, first melting pixel to last rising one, in ms.
 *
 * §06's default — "screen transitions, content entering" — which is exactly
 * what this is. Not a number chosen for this cue; the number the system
 * already gives anything that moves. `--base` in design/tokens.json.
 */
export const NAV_MELT_GESTURE_MS = 200;

/**
 * How long the outgoing cluster takes to sink, in ms — §06's `--fast`.
 *
 * `--fast` rather than `--base` because the melt is the half nobody is waiting
 * for: the information on screen is the *next* question's controls, and the
 * old ones leaving is a departure, not an arrival. Anything leaving should be
 * gone before the eye goes looking for it.
 */
export const NAV_MELT_MS = 120;

/** How long the incoming cluster takes to rise, in ms — §06's `--fast` again,
 * so both halves of one gesture move at one speed. */
export const NAV_RISE_MS = 120;

/**
 * How long after the melt starts the rise begins, in ms.
 *
 * The two halves OVERLAP, and that is the whole difference between a melt that
 * reforms and two animations played back to back. At 80 the outgoing cluster
 * is two thirds of the way into the bar when the new one starts coming out of
 * it, so there is never a frame with nothing in the band and never a moment
 * that reads as a pause. Back to back would be 120 + 120 = 240ms, over §06's
 * default, and it would read as a wait.
 *
 * It is also the only number here the design system does not name, because it
 * is not a duration — it is where two named durations are laid over each other
 * to add up to a third (`NAV_MELT_GESTURE_MS`). navMelt.test.ts holds that sum.
 */
export const NAV_RISE_DELAY_MS = NAV_MELT_GESTURE_MS - NAV_RISE_MS;

/**
 * The longest a *whole cluster* may take to reform, first melting pixel to
 * last rising one, in ms — §06's `--slow`, used as a ceiling.
 *
 * Not a second opinion about how long a control moves: every control still
 * moves for `NAV_MELT_GESTURE_MS`, §06's row for "screen transitions, content
 * entering", which is what a control leaving and returning is. This is the
 * envelope the wave's phase spread has to fit inside, and it is `--slow`
 * because §06 names three durations and `--slow` is the longest of them — the
 * most the design system lets anything on screen take. Nothing here claims
 * §06's *use* for `--slow`; what is borrowed is its number, as a limit.
 *
 * A ceiling rather than a target because it is the only defensible way to
 * spend more than 200ms on the path of forty-nine answers: the gesture may
 * cost as much as the system's slowest cue and not one millisecond more, and
 * the stagger below is whatever is left over once that is fixed. Sampled
 * frames at 40ms of stagger (a 280ms cluster) read as a wave too; 60ms was
 * kept because it is the more legible of the two and because it is the value
 * that falls out of this number rather than one picked by eye.
 */
export const NAV_MELT_CLUSTER_MS = 320;

/**
 * How long after one control starts the next one does, in ms.
 *
 * **Derived, not chosen.** It is exactly what makes a full bar's wave land on
 * `NAV_MELT_CLUSTER_MS`, so the two numbers cannot drift apart and a fourth
 * control could never be added without the arithmetic — and navMelt.test.ts —
 * noticing. At `FLOW_NAV_MAX_CONTROLS` of 3 it comes out at 60ms, which is
 * half of `--fast`: by the time Next starts to go, Back is half gone.
 *
 * Why a stagger at all rather than simply a bigger or slower melt: three words
 * leaving together is one event and the eye discards it, whereas three words
 * leaving in turn is a direction, and there is always a control still standing
 * to see the moving one against. It is also the only lever that makes the
 * gesture more legible without making any single control move further or for
 * longer — the two things rules 1 and 2 above will not allow.
 */
export const NAV_MELT_STAGGER_MS =
  (NAV_MELT_CLUSTER_MS - NAV_MELT_GESTURE_MS) / (FLOW_NAV_MAX_CONTROLS - 1);

/**
 * How long the wave takes to cross a cluster of `count` controls, in ms.
 *
 * The bar holds one, two or three controls depending on the question, so the
 * gesture is not one length — this is the sum, in one place, for the tests and
 * for anything that needs to know when the cluster has finished. A cluster of
 * nothing takes no time at all rather than a negative amount.
 */
export function navMeltClusterMs(count: number): number {
  if (count <= 0) return 0;
  return NAV_MELT_GESTURE_MS + (count - 1) * NAV_MELT_STAGGER_MS;
}

/**
 * How far into the wave the control standing `index` places from the left
 * starts, in ms. The panel publishes the index and the stylesheet does the
 * multiplication, but the rule is stated here.
 */
export function navMeltOffsetMs(index: number): number {
  return Math.max(0, index) * NAV_MELT_STAGGER_MS;
}

/**
 * How far a control's ink travels, in px — down into the bar on the way out,
 * up out of it on the way back.
 *
 * The ink, not the control: what moves is `.navbtn-face`
 * (components/NavButton.tsx), a box inside the button that holds the word and
 * its chevron. The button itself does not move a pixel, which is what keeps
 * VB-10's promise that nothing on screen moves while a question prints, and
 * what keeps every frame of the gesture pressable.
 *
 * Bounded on both sides, and each bound is the point of the number:
 *
 *  - **At least half the painted control's own height** (`navPaintHeight()`),
 *    or the word does not disappear into the surface, it nudges. A nudge on
 *    every one of forty-nine answers is a twitch, not a gesture.
 *  - **Under half the pressable box** (`FLOW_NAV_TARGET`), so the ink never
 *    travels outside the control it belongs to. The word a person is looking
 *    at and the box they can press stay the same object throughout.
 *  - **Under the clear space beneath the cluster** (`navPaintGapAboveDrawer()`),
 *    so the deepest frame of the melt still paints above the drawer's edge and
 *    the gesture can never draw over the grab handle.
 *
 * V2.0 moves it from 14 to 20. Fourteen was one pixel over the floor — the
 * smallest travel the bounds allow — and at that distance the drop is doing
 * almost none of the work the squash is doing, so the ink reads as blinking
 * out rather than sinking. Twenty is `navMeltDropBounds().max` less the two
 * pixels of margin that keep it honestly *under* both ceilings rather than on
 * them, and it is still under half the pressable box and still nine pixels
 * clear of the drawer at the bottom of the travel.
 */
export const NAV_MELT_DROP = 20;

/** What became of one control across the swap. */
export type NavFate =
  /** It was on the last question and is not on this one: it melts down and
   *  does not come back. Skip, on the question after a skippable one. */
  | 'melts'
  /** It was there before and is there now: it melts down and rises back out.
   *  The common case — Next, on every advance. */
  | 'reforms'
  /** It was not there before and is now: it rises out of a bar it never sank
   *  into. Back, on the second question of an interview. */
  | 'arrives';

export interface NavFateEntry {
  /** The control's own id, as the cluster published it — `back`, `next`,
   * `skip`. A plain string: this file does not have a list of the controls
   * that exist, and must not grow one. */
  id: string;
  fate: NavFate;
}

/**
 * What happens to each control when a cluster of `from` is replaced by a
 * cluster of `to`.
 *
 * Ordered outgoing-first so the result reads in the order the eye sees it: the
 * controls that were already on screen, in the order they stood, then anything
 * new arriving at the end. Duplicate ids collapse — a cluster cannot hold the
 * same control twice, and if one ever did, saying so twice would not help.
 *
 * The panel stamps the answer on both clusters (`data-nav-fate`), which is how
 * "only the buttons valid for the next question rise back out" becomes
 * something a test can read off the screen rather than infer from a class.
 */
export function navMeltPlan(from: readonly string[], to: readonly string[]): NavFateEntry[] {
  const leaving = new Set(from);
  const arriving = new Set(to);
  const seen = new Set<string>();
  const plan: NavFateEntry[] = [];
  const push = (id: string, fate: NavFate) => {
    if (seen.has(id)) return;
    seen.add(id);
    plan.push({ id, fate });
  };
  for (const id of from) push(id, arriving.has(id) ? 'reforms' : 'melts');
  for (const id of to) if (!leaving.has(id)) push(id, 'arrives');
  return plan;
}

/** The controls that rise back out — everything the next question offers, and
 * nothing else. Derived from the plan rather than from `to` directly so the
 * rule VB-53 states and the rule the panel plays are the same sentence. */
export function navRisers(plan: readonly NavFateEntry[]): string[] {
  return plan.filter((entry) => entry.fate !== 'melts').map((entry) => entry.id);
}

/** The controls that sink — everything the last question offered. */
export function navMelters(plan: readonly NavFateEntry[]): string[] {
  return plan.filter((entry) => entry.fate !== 'arrives').map((entry) => entry.id);
}

/**
 * Whether this gesture leaves the band empty at any point, i.e. whether the
 * next question offers no controls at all.
 *
 * Not a rendering decision — `.flow-foot:empty` already hides an empty band —
 * but the one case where "rise back out" has nothing to say, and worth being
 * able to ask about rather than discovering as a blank strip.
 */
export function navReformsToNothing(plan: readonly NavFateEntry[]): boolean {
  return navRisers(plan).length === 0;
}

/** The bounds `NAV_MELT_DROP` is held inside, exported so the test states them
 * once and the comment above does not become the only record of them. */
export function navMeltDropBounds(): { min: number; max: number } {
  return {
    min: navPaintHeight() / 2,
    max: Math.min(FLOW_NAV_TARGET / 2, navPaintGapAboveDrawer()),
  };
}
