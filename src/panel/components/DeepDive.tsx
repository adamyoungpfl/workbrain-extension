import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { DeepDiveEntry } from '../../schema/flow.types';
import {
  CLOSED,
  EXPAND_MS,
  isExpanded,
  isMoving,
  isRendered,
  roleOf,
  settle,
  showsAnswer,
  toggle,
  type ExpandPhase,
  type ItemRole,
} from '../../core/motion/disclosure';
import {
  isAttractOver,
  shimmerState,
  type ShimmerTrigger,
} from '../../core/motion/shimmer';
import {
  ROTATE_MS,
  ROTATION_RUNNING,
  isRunning,
  nextIndex,
  stopRotation,
  viewFor,
  type RotationHold,
  type RotationInput,
  type RotationInteraction,
} from '../../core/motion/rotation';
import { prefersReducedMotion } from '../cues/verbs';
import { S } from '../strings';
import './DeepDive.css';

/**
 * V1.3 VB-16 — THE ONE CONSTANT THAT DECIDES WHEN THE FOLLOW-UPS SHIMMER.
 *
 * Flip this line and rebuild; nothing else changes. The keyframes for all
 * three live in DeepDive.css and are selected by `data-shimmer` on the row.
 *
 *   'once'       — one coloured pass when the question appears, then still.
 *   'hover'      — only under the pointer or on keyboard focus. Still at rest.
 *   'continuous' — never stops. What "shimmer effect" most literally means.
 *   'none'       — no shimmer at all.
 *
 * Shipping 'once', per docs/V1.3-REFINEMENT.md VB-16, which asks for it by
 * name and argues the case: these chips are easy to miss entirely, and one
 * coloured pass fixes that at the only moment it matters — when the question
 * arrives and the eye is still moving. The reason not to run it forever is the
 * reason V1.2 settled the status-bar mark on 'once' (see FlowProgress.tsx's
 * STATUS_MARK_SPIN): a shimmer on every one of forty-nine questions is
 * permanent peripheral motion sitting beside text people are reading in order
 * to think, and it is worse here than there — it is *coloured*, it is inside
 * the reading column rather than up in the status bar, and there are two or
 * three of them at once.
 *
 * The attract burns out for real. Once the last chip's sweep has ended this
 * component renders `data-shimmer="none"`, so nothing is left running or
 * merely invisible: `document.getAnimations()` comes back empty, which is what
 * tests/e2e/deep-dive.spec.ts asserts rather than taking the word of a class.
 *
 * Under `prefers-reduced-motion` no sweep is ever scheduled, in any mode, and
 * the chips get a static coloured wash instead — §06's own rule, "the sweep
 * becomes a steady tint". They are not left plainer than everyone else's:
 * being easy to find is the whole point of the cue, so the still version has
 * to do that job, not just avoid moving.
 */
export const CHIP_SHIMMER: ShimmerTrigger = 'once';

/**
 * The open/closed marker: a chevron that points right when closed and down
 * when open. Drawn rather than typed — the obvious `▸`/`▾` characters render
 * as an all-but-invisible dot in the panel's own font stack, which would
 * leave fill and weight as the only signals and put the disclosure straight
 * through docs/GUARDRAILS.md's "nothing distinguished by colour alone".
 * Stroke-based, `currentColor`, `aria-hidden` — the same convention as
 * Home.tsx's PERSON_ICON. Rotation is driven by a class, not a CSS
 * attribute selector, so it is assertable without a stylesheet.
 *
 * V2.0 VB-57 MAKES THIS LOAD-BEARING. The rotating link's underline is gone,
 * and an underlined link minus its underline is a coloured word — which
 * docs/GUARDRAILS.md forbids outright. What replaces the underline is this
 * mark plus the link's weight: a shape in front of the text that no other
 * text in the question area has, drawn in strokes rather than fill so it
 * survives greyscale at exactly the contrast it had in colour, and turning 90°
 * when the thing opens. tests/e2e/follow-up-rotation.spec.ts strips every
 * colour from the document and measures both signals rather than taking this
 * paragraph's word for it.
 */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={open ? 'deepdive-mark is-open' : 'deepdive-mark'}
      viewBox="0 0 16 16"
      width="11"
      height="11"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M6 3.5 L10.5 8 L6 12.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A box in the row's own coordinates — the frame every ghost is pinned to. */
interface Box {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

function boxOf(el: HTMLElement, root: HTMLElement): Box {
  const r = el.getBoundingClientRect();
  const o = root.getBoundingClientRect();
  return { top: r.top - o.top, left: r.left - o.left, width: r.width, height: r.height };
}

function itemClass(role: ItemRole): string {
  switch (role) {
    case 'expanded':
      return 'deepdive-item is-open';
    case 'leaving':
      return 'deepdive-item is-leaving';
    case 'entering':
      return 'deepdive-item is-entering';
    case 'collapsing':
      return 'deepdive-item is-collapsing';
    default:
      return 'deepdive-item';
  }
}

/**
 * `prefers-reduced-motion`, live.
 *
 * V1.3 read it inside the press handler, which was enough when the only
 * question was "animate this click or not". V1.8 VB-42 asks it a standing
 * question instead — whether a five-second rotation is scheduled at all — and
 * that has to change when the person changes the setting, not the next time
 * they press something. Same source of truth as `prefersReducedMotion()`, kept
 * in state and subscribed.
 */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    const query =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    if (!query?.addEventListener) return;
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

export interface DeepDiveProps {
  /** Namespaces the generated answer element ids — must be unique on screen. */
  idPrefix: string;
  entries: DeepDiveEntry[];
  /**
   * V1.8 VB-42 — the collapsed presentation, and nothing else.
   *
   * `'one'` shows a single follow-up as a text link, rotating every five
   * seconds; `'all'` is V1.3's row, every follow-up at once. Whichever is on
   * screen, pressing one runs exactly the same expand-in-place disclosure
   * (docs/V1.8-REFINEMENT.md, DECISIONS 1).
   *
   * The default is `'all'`, deliberately: the plain list is the base
   * presentation this component falls back to from every direction — reduced
   * motion, a single follow-up, and the person pressing the stop — and a
   * default that is the quiet one cannot surprise a caller into motion it did
   * not ask for.
   */
  mode?: 'one' | 'all' | undefined;
  /**
   * V2.0 VB-57 — an interaction the surface saw somewhere else in the question
   * area, which ends this rotation for good exactly as one of its own does.
   *
   * FLAG 1 reads "any interaction" broadly and most of that list happens
   * outside this component's box: typing in the answer field, pressing
   * rephrase, clicking blank space beside the question. Those belong to the
   * surface, so the surface names what it saw and hands the name down here,
   * where it goes through the same `stopRotation` as a click on the link. One
   * machine, two sources of signal — see `core/motion/rotation.ts`.
   *
   * `null` while nothing has happened. It can only ever go from `null` to a
   * reason, because the surface's own copy of the state is terminal too.
   */
  stoppedBy?: RotationInteraction | null | undefined;
  /**
   * V1.3 VB-18: which follow-up is open, for anything outside this component
   * that has to follow it — today, the narrator, whose `followUp` voice role
   * is exactly this content (see Flow.tsx's `narrateFollowUp`). Called with
   * the entry that just opened, or `null` when the open one closes.
   *
   * Fired from the press handler rather than an effect, so it lands on the
   * press itself with no frame of lag, and it changes nothing about the
   * disclosure — a caller that ignores it gets V1.3 VB-16's behaviour exactly.
   */
  onDisclose?: ((entry: DeepDiveEntry | null) => void) | undefined;
}

/**
 * V1.1 VB-03 — the deeper-dive disclosure, rebuilt for V1.3 VB-15 and VB-16.
 * A row of small tags under a question; pressing one opens its answer.
 *
 * WHAT V1.3 CHANGED, AND WHY EACH PIECE IS WHERE IT IS
 *
 * **VB-15 — thinner.** These now read as tags rather than buttons: the bubble
 * is 30px tall, not 44. The 44×44 floor in docs/GUARDRAILS.md is not
 * negotiable and has not moved — the *hit target* is still 44px, it is simply
 * bigger than the paint. The button carries 13px of vertical padding and pulls
 * 8px of it back out of the layout with a negative margin, so the box you can
 * press overhangs the bubble you can see, above and below. That is the whole
 * trick, it is in DeepDive.css next to the numbers, and the row's own
 * `row-gap` is widened to keep two rows of hit targets from overlapping.
 * Because the paint is now on the *item* rather than on the button, the focus
 * ring is too (`:has()`), or it would draw a rectangle around a target nobody
 * can see.
 *
 * **VB-16 — expand in place.** Pressing a follow-up expands *that bubble* into
 * its answer and the others leave; closing brings them back. This replaces
 * VB-03's behaviour, where the answer appeared underneath and the siblings sat
 * where they were, and it means every interaction changes the height of the
 * block while someone is looking at it. So nothing here cuts:
 *
 * - **Which item is doing what** is `core/motion/disclosure.ts` — a pure state
 *   machine with two transitional states, tested without a browser.
 * - **The leaving siblings are taken out of flow immediately**, pinned to the
 *   boxes they were painted in a moment earlier, and faded. Out of flow means
 *   the row's natural height is already its destination, so one transition can
 *   carry the box there with nothing reflowing underneath it.
 * - **The bubble itself is FLIPped**: it starts the transition at exactly the
 *   geometry it was painted at (position, width, height) and animates to the
 *   one it is going to. Nothing snaps — not when the chip that was pressed was
 *   the second one in the row and the card starts from the left edge, and not
 *   on the way back, where the siblings return to precisely the boxes they
 *   left from.
 * - **The answer's width is pinned** for the length of the transition, so the
 *   paragraph is laid out once, at its final width, and the growing bubble
 *   reveals it rather than re-wrapping it on every frame.
 * - **Reduced motion does none of this.** No ghosts, no transition, no timer:
 *   the disclosure opens and closes, immediately, and still announces.
 *
 * **FOCUS IS THE PART THAT WOULD SILENTLY BREAK.** The control that was
 * pressed becomes the expanded bubble, so it must survive its siblings
 * unmounting. It does, because it keeps its key and therefore its DOM node.
 * The belt to that braces is `rescueFocus`: if focus has fallen to `<body>` by
 * the time the siblings go, it is put back on the chip. It is deliberately not
 * written as "always focus the chip" — someone who tabbed on to the field
 * during those 200ms must keep the focus they moved (docs/GUARDRAILS.md:
 * nothing steals focus).
 *
 * **The answer is announced.** `.deepdive-say` is a permanent
 * `aria-live="polite"` region wrapping each answer, so revealing one is a
 * change inside a live region rather than a change nobody hears — which
 * matters more now than it did in V1.1, because opening also removes the other
 * chips from under the reader's cursor.
 *
 * Unchanged from V1.1: each answer element always exists while its chip does,
 * so `aria-controls` always resolves; open is never signalled by colour alone
 * (chevron turns, label goes bold, fill changes); and the copy is not here —
 * these are per-question strings from core/flow/deepDive.ts.
 *
 * WHAT V1.8 VB-42 CHANGED: THE COLLAPSED PRESENTATION, AND ONLY THAT
 *
 * The row of chips becomes **one follow-up at a time, as a text link, changing
 * every five seconds**. Everything above still runs: pressing the link expands
 * it in place through the same `core/motion/disclosure.ts` state machine, the
 * same FLIP, the same focus rescue, the same live region
 * (docs/V1.8-REFINEMENT.md, DECISIONS 1 — the rotation *wraps* VB-16, it does
 * not replace it). What is different is that in `mode="one"` exactly one item
 * is rendered, and it is painted as a sentence rather than a tag.
 *
 * The rotation is confined to the follow-ups, deliberately and by Adam's own
 * words (DECISIONS 3): the question above never auto-changes, and the status
 * bar is untouched. Neither is reachable from this file.
 *
 * **WCAG 2.2.2 (Pause, Stop, Hide) IS THE DESIGN, NOT A CHECK AFTERWARDS.**
 * This auto-updates, starts on its own, lasts longer than five seconds and
 * sits beside content someone is reading, so it needs a way to stop.
 *
 * WHAT V2.0 VB-57 CHANGED: THE MECHANISM, AND THE PAINT
 *
 * V1.8 answered 2.2.2 with four temporary holds and a visible "Show all".
 * docs/V2.0-REFINEMENT.md FLAG 1 replaces that: **the rotation stops
 * permanently on any interaction and never resumes**, so the control is gone.
 * `core/motion/rotation.ts` holds the machine and the reasoning; what this
 * file adds is the wiring, and the wiring is three capture handlers on the row
 * — a click, a keypress or focus arriving anywhere inside it — plus the
 * `stoppedBy` prop for the rest of the question area, which is not this
 * component's to listen to. Hover is the one thing still merely held: it is
 * the pointer resting, not a decision, and letting go lets it move on.
 *
 * Capture, not bubble, and on the row rather than on the link: a press that
 * opens a follow-up must stop the clock *before* the disclosure re-renders,
 * and a click that lands on the row's padding rather than on the link is still
 * a person touching this question.
 *
 * Under `prefers-reduced-motion` no clock is ever scheduled and the static
 * list is what renders — the still equivalent carries *more* than the moving
 * one, not less.
 *
 * Nothing here ever moves focus. The rotation swaps a link that nobody is
 * touching; the moment it is hovered or focused it stops, so it cannot change
 * identity between the decision to click and the click.
 */
export function DeepDive({
  idPrefix,
  entries,
  onDisclose,
  mode = 'all',
  stoppedBy = null,
}: DeepDiveProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<ExpandPhase>(CLOSED);
  const [ghosts, setGhosts] = useState<ReadonlyMap<number, Box>>(() => new Map());
  const [attracted, setAttracted] = useState(false);

  // ── V1.8 VB-42 — the rotation, which is presentation and nothing else ──
  const reduced = useReducedMotion();
  const [turn, setTurn] = useState(0);
  const [hovered, setHovered] = useState(false);
  /**
   * V2.0 VB-57 — whether this question's rotation has ended, and why.
   *
   * The surface's signal goes through the same terminal transition as this
   * component's own, so there is one machine rather than two agreeing states:
   * `stopRotation` is idempotent and keeps the first reason, so whichever
   * arrived first is the one recorded, and once either has fired nothing here
   * can produce a running life again.
   *
   * State rather than a ref because the clock has to be torn down on the
   * frame it stops, not on the next render that happens for another reason.
   */
  const [ownLife, setOwnLife] = useState(ROTATION_RUNNING);
  const life = stoppedBy ? stopRotation(ownLife, stoppedBy) : ownLife;
  /** One interaction, whatever it was. Idempotent, so calling it on every
   * event of every kind costs one render at most. */
  const stop = (by: RotationInteraction) => setOwnLife((current) => stopRotation(current, by));
  /** The tallest the link has been, so a longer follow-up rotating in does not
   * push the field down under someone's hands. Only ever grows, and only
   * within one question — see `.deepdive.is-one` in DeepDive.css. */
  const [reserved, setReserved] = useState(0);

  const holds: RotationHold[] = [];
  if (hovered) holds.push('hover');
  const rotation: RotationInput = { count: entries.length, mode, reduced, holds, life };
  const view = viewFor(rotation, turn);
  const running = isRunning(rotation);

  /**
   * The five seconds.
   *
   * An interval rather than a chain of timeouts, and torn down whenever
   * `running` goes false — the hover hold and the terminal stop alike, so a
   * held or stopped link is not merely ignoring a clock still ticking under
   * it. After a hover, letting go starts a fresh five seconds rather than
   * resuming a stale one: a link that changed a fifth of a second after the
   * pointer left would be exactly the swap WCAG 2.2.2 is about. After a stop
   * there is nothing to start — `isRunning` can never come back true for this
   * question (core/motion/rotation.ts).
   */
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setTurn((current) => nextIndex(current, entries.length));
    }, ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [running, entries.length]);

  /** Hold the room the tallest link so far needed. Measured after paint, on
   * the item rather than the row, so the open card is free to be any size. */
  useLayoutEffect(() => {
    if (view.kind !== 'one' || phase.kind !== 'closed') return;
    const item = rootRef.current?.querySelector<HTMLElement>('[data-dd-item]');
    if (!item) return;
    const height = item.getBoundingClientRect().height;
    setReserved((most) => (height > most ? height : most));
  }, [view.kind, phase.kind, turn, entries]);

  /** Where each chip sits when nothing is open, and how tall the row is then.
   * Captured once, on the way in, and reused on the way out: closing has to
   * put the siblings back exactly where they were, and by then they are not in
   * the document to be measured. */
  const restBoxes = useRef<ReadonlyMap<number, Box>>(new Map());
  const restHeight = useRef<number | null>(null);
  /** The geometry the bubble and the row were painted at a moment ago — the
   * "first" half of the FLIP, read in the event handler before React renders
   * anything, because after that it is gone. */
  const fromBox = useRef<Box | null>(null);
  const fromHeight = useRef<number | null>(null);
  /** The open answer's width, read before it is taken out of flow. Closing
   * needs it: an out-of-flow paragraph shrink-wraps, so measuring it after the
   * render would lock in a width it never had, and the text would re-wrap in
   * the same frame it started fading. */
  const fromAnswerWidth = useRef<number | null>(null);

  function press(index: number) {
    // FLAG 1's "opening a follow-up", wired as itself rather than left to the
    // row's click capture to cover. A press driven from the keyboard, from a
    // test, or from anything that is not a pointer is still an interaction,
    // and this is the line that says so. When a pointer did it the capture
    // handler got there first and `stopRotation` keeps that reason — the
    // reason is a label on a terminal state, not a decision anything reads.
    stop('open');
    const root = rootRef.current;
    const item = root?.querySelector<HTMLElement>(`[data-dd-item="${index}"]`) ?? null;
    const next = toggle(phase, index, true);
    const opening = next.kind === 'opening';
    // Told on the press, not on the settle: whether this press opens or closes
    // is already decided here, and it is the same answer on the reduced-motion
    // path below, which skips the transitional states entirely.
    onDisclose?.(opening ? (entries[index] ?? null) : null);

    // Reduced motion, or nothing to measure: straight to the end state.
    // Nothing is lost — the disclosure opens, announces, and keeps focus.
    // Closing also needs the boxes captured when it opened; without them (a
    // motion preference flipped mid-interaction) the honest move is to cut,
    // not to animate to coordinates that are guesses.
    const animate = !!root && !!item && !prefersReducedMotion();
    if (!root || !item || !animate || (!opening && restHeight.current === null)) {
      setGhosts(new Map());
      setPhase(toggle(phase, index, false));
      return;
    }

    fromBox.current = boxOf(item, root);
    fromHeight.current = root.getBoundingClientRect().height;
    const answerNow = root.querySelector<HTMLElement>(`[data-dd-answer="${index}"]`);
    fromAnswerWidth.current =
      answerNow && !answerNow.hidden ? answerNow.getBoundingClientRect().width : null;

    // Only a genuinely resting row is worth remembering as the resting row —
    // measured mid-transition, these would be the boxes of a half-played
    // animation, and closing would put the chips back somewhere they never
    // were.
    if (opening && phase.kind === 'closed') {
      const boxes = new Map<number, Box>();
      root.querySelectorAll<HTMLElement>('[data-dd-item]').forEach((el) => {
        boxes.set(Number(el.dataset.ddItem), boxOf(el, root));
      });
      restBoxes.current = boxes;
      restHeight.current = fromHeight.current;
    }

    const siblings = new Map(restBoxes.current);
    siblings.delete(index);
    setGhosts(siblings);
    setPhase(next);
  }

  /**
   * Drive one transition, or clear up after one.
   *
   * Runs as a layout effect so the "last" measurement and the from-state are
   * written before the browser has painted the new tree — the frame where the
   * bubble would otherwise be seen at its destination is the frame this
   * removes.
   */
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    if (!isMoving(phase)) {
      // Settled: hand every box back to the stylesheet.
      root.style.height = '';
      root.style.overflow = '';
      root.style.transitionProperty = '';
      root.querySelectorAll<HTMLElement>('[data-dd-item], [data-dd-answer]').forEach((el) => {
        el.style.width = '';
        el.style.height = '';
        el.style.transform = '';
        el.style.transitionProperty = '';
      });
      return;
    }

    const index = phase.index;
    const item = root.querySelector<HTMLElement>(`[data-dd-item="${index}"]`);
    const answer = root.querySelector<HTMLElement>(`[data-dd-answer="${index}"]`);
    const from = fromBox.current;
    const startedAt = fromHeight.current;
    fromBox.current = null;
    fromHeight.current = null;

    if (item && from && startedAt !== null) {
      // The destination, measured in the tree React has just committed: the
      // ghosts are already out of flow, so this is the real final layout.
      const dest = boxOf(item, root);
      const natural = root.getBoundingClientRect().height;
      const target = phase.kind === 'opening' ? dest : (restBoxes.current.get(index) ?? dest);
      const toHeight = phase.kind === 'opening' ? natural : (restHeight.current ?? natural);

      // Lay the paragraph out once, at the width it is read at, so the bubble
      // reveals it instead of re-wrapping it on every frame. Opening measures
      // the width it is about to have; closing was told the width it had.
      const answerWidth =
        phase.kind === 'opening'
          ? (answer?.getBoundingClientRect().width ?? 0)
          : (fromAnswerWidth.current ?? 0);
      if (answer && answerWidth > 0) answer.style.width = `${answerWidth}px`;
      fromAnswerWidth.current = null;

      item.style.transitionProperty = 'none';
      item.style.width = `${from.width}px`;
      item.style.height = `${from.height}px`;
      item.style.transform = `translate(${from.left - dest.left}px, ${from.top - dest.top}px)`;
      root.style.transitionProperty = 'none';
      root.style.overflow = 'hidden';
      root.style.height = `${startedAt}px`;

      // One forced reflow, so the browser has two values to interpolate
      // between rather than one it never painted.
      void root.offsetHeight;

      item.style.transitionProperty = '';
      item.style.width = target === dest ? '' : `${target.width}px`;
      item.style.height = target === dest ? '' : `${target.height}px`;
      item.style.transform =
        target === dest ? '' : `translate(${target.left - dest.left}px, ${target.top - dest.top}px)`;
      root.style.transitionProperty = '';
      root.style.height = `${toHeight}px`;
    }

    const timer = window.setTimeout(() => {
      setPhase(settle);
      setGhosts(new Map());
    }, EXPAND_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  /**
   * The siblings have just unmounted. If that took the focus with it — which
   * it must not, and does not, but this is the failure this feature would have
   * shipped silently — put it back on the chip that is now the open bubble.
   * Only from `<body>`: focus deliberately moved elsewhere stays where the
   * person put it.
   */
  useLayoutEffect(() => {
    if (phase.kind !== 'open') return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    rootRef.current?.querySelector<HTMLButtonElement>(`[data-dd-chip="${phase.index}"]`)?.focus();
  }, [phase]);

  /**
   * The attract belongs to the list and not to the rotation.
   *
   * A coloured sweep exists to stop three small tags going unnoticed in a row
   * of them (see CHIP_SHIMMER above). One blue sentence with a chevron in
   * front of it has no such problem, and sweeping it every five seconds would
   * turn a
   * one-time cue into the permanent peripheral motion V1.2 and V1.3 both
   * decided against — the exact concern docs/V1.8-REFINEMENT.md's fourth
   * conflict raises about this feature. So the rotating presentation ships
   * `none`, and the static list keeps the attract it has always had.
   */
  const shimmer = view.kind === 'all' ? shimmerState(CHIP_SHIMMER, attracted) : 'none';

  return (
    <div
      className={view.kind === 'one' ? 'deepdive is-one' : 'deepdive'}
      ref={rootRef}
      role="group"
      aria-label={S.followUpsLabel}
      data-shimmer={shimmer}
      // Hover holds the rotation while the pointer is on it — the one reason
      // left that lets go (core/motion/rotation.ts). On the row rather than on
      // the link, so the link cannot move out from under a pointer that is on
      // its way to it.
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      // V2.0 VB-57 — and these three end it for good. Capture, so a press has
      // stopped the clock before the disclosure it opens re-renders; on the
      // row, so blank space beside the link counts as touching this question.
      onClickCapture={() => stop('click')}
      onKeyDownCapture={() => stop('key')}
      onFocusCapture={() => stop('focus')}
      onAnimationEnd={(event) => {
        const owner = (event.target as HTMLElement).closest?.('[data-dd-item]');
        const index = owner instanceof HTMLElement ? Number(owner.dataset.ddItem) : -1;
        if (isAttractOver(CHIP_SHIMMER, event.animationName, index, entries.length)) {
          setAttracted(true);
        }
      }}
    >
      {entries.map((entry, index) => {
        const role = roleOf(phase, index);
        if (!isRendered(role)) return null;
        // VB-42: one at a time. The others are not hidden, they are not
        // rendered — a hidden link is still a tab stop and still something a
        // screen reader can be told about.
        if (view.kind === 'one' && index !== view.index) return null;
        const answerId = `${idPrefix}-deepdive-${index}`;
        const open = isExpanded(phase, index);
        const ghost = role === 'leaving' || role === 'entering' ? ghosts.get(index) : undefined;
        // The stagger is `--dd-index * --fast` in CSS; the index is data, so
        // it is the one thing set inline here.
        const style = {
          '--dd-index': index,
          // VB-42: the room the tallest follow-up needed, held for all of
          // them. Measured, because the wording is content and a follow-up
          // that wraps to two lines must not shove the answer field down.
          ...(view.kind === 'one' && reserved > 0 ? { '--dd-reserve': `${reserved}px` } : null),
          ...(ghost ? { top: ghost.top, left: ghost.left, width: ghost.width, height: ghost.height } : null),
        } as CSSProperties;

        return (
          <div key={answerId} className={itemClass(role)} data-dd-item={index} style={style}>
            <button
              type="button"
              className="deepdive-chip"
              data-dd-chip={index}
              aria-expanded={open}
              aria-controls={answerId}
              onClick={() => press(index)}
            >
              <Chevron open={open} />
              <span className="deepdive-chip-label">{entry.q}</span>
            </button>
            <div className="deepdive-say" aria-live="polite">
              <p
                id={answerId}
                data-dd-answer={index}
                className={role === 'collapsing' ? 'deepdive-answer is-collapsing' : 'deepdive-answer'}
                hidden={!showsAnswer(role)}
              >
                {entry.a}
              </p>
            </div>
          </div>
        );
      })}
      {/* V2.0 VB-57: there is no "Show all" here any more, and its absence is
          the point. WCAG 2.2.2's mechanism is now the rule in
          core/motion/rotation.ts — the first thing the person does to this
          question stops the motion for the rest of it — which is a stop they
          reach by doing what they were already doing rather than by finding a
          control. Deleting the button without that rule would have been a
          regression; docs/V2.0-REFINEMENT.md FLAG 1 says so in those words. */}
    </div>
  );
}
