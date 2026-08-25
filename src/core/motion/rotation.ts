/**
 * V1.8 VB-42 — one follow-up at a time, rotating, without a DOM.
 * V2.0 VB-57 — and it now stops for good the first time the person does
 * anything at all.
 *
 * The follow-ups under a question stop being a row of chips and become a
 * single text link that changes every five seconds. **The rotation is
 * presentation only** (docs/V1.8-REFINEMENT.md, DECISIONS 1): a rotating link
 * still expands in place when it is clicked, exactly as V1.3 VB-16 does today,
 * so `core/motion/disclosure.ts` is still the machine that runs the click and
 * nothing here replaces any of it. What this module decides is only *which
 * follow-ups are on screen and whether the clock is running*.
 *
 * WCAG 2.2.2 (PAUSE, STOP, HIDE) IS WHY THIS FILE HAS SO MANY REASONS IN IT.
 * The success criterion applies to content that auto-updates, starts
 * automatically, lasts more than five seconds and is presented alongside other
 * content — which is this, precisely. V1.8 answered it with four temporary
 * holds and one visible control, "Show all".
 *
 * V2.0 VB-57 REMOVES THAT CONTROL, AND THE ONLY REASON IT MAY GO IS THE RULE
 * BELOW. docs/V2.0-REFINEMENT.md FLAG 1, decided by Adam on 2026-08-24:
 *
 *   **the rotation stops permanently on any interaction and never resumes.**
 *
 * A person who touches the question at all is a person for whom nothing moves
 * again, which is the "stop" the criterion asks for — arrived at by doing the
 * thing they were already doing rather than by finding a control and pressing
 * it. Plain deletion of "Show all" without this would have been a regression,
 * and the flag says so in those words.
 *
 * SO THERE ARE NOW TWO DIFFERENT KINDS OF REASON IN THIS FILE, AND THE WHOLE
 * POINT IS THAT THEY ARE DIFFERENT KINDS:
 *
 * - **`RotationLife`** — the terminal one. It starts `running`, it goes
 *   `stopped` on the first interaction, and **there is no function in this
 *   module that takes it back**. That absence is the design: "never resumes"
 *   is not a rule a caller has to remember, it is a transition that does not
 *   exist. Not a hold, not a flag someone can clear, not a timer.
 * - **`RotationHold`** — the temporary one, and there is exactly one left.
 *   Hover is not an interaction; it is the pointer resting on the way past.
 *   It still has to stop the clock, or the link changes identity between the
 *   moment someone decides to click and the click itself, which is the failure
 *   2.2.2 exists to prevent — but a pointer moving away is not a decision, so
 *   it lets go. Everything V1.8 held temporarily and FLAG 1 names as an
 *   interaction — focus, answering, opening a follow-up — is a `stopped` now.
 *
 * WHAT "ANY INTERACTION" MEANS IS DELIBERATELY BROAD (FLAG 1's own list): a
 * click anywhere in the question area, any keypress, focus arriving, typing in
 * the field, opening a follow-up, pressing rephrase. `RotationInteraction`
 * enumerates them so the surface has to name which one it saw, and so a test
 * can walk the list rather than trust that six wirings were all remembered.
 *
 * **STOPPING FREEZES THE LINK THAT IS SHOWING. IT DOES NOT SPILL THE LIST.**
 * `viewFor` reads the presentation, not the life, so a stopped rotation is
 * still one follow-up at a time. The alternative — stop by revealing all of
 * them, the way "Show all" used to — would mean that clicking into the answer
 * field grows the block from one row to three under the person's hands, which
 * is the shove VB-42 measured a reserved height to prevent, arriving on the
 * one gesture nobody could avoid making. A stop that moves the page is not a
 * stop.
 *
 * - **prefers-reduced-motion** — the static list, with no rotation scheduled
 *   at all. The still version carries the same information because it carries
 *   *more* of it: every follow-up at once (docs/GUARDRAILS.md).
 *
 * ONE ENTRY IS NEVER A ROTATION. Most questions carry one or two follow-ups
 * and none carries more than three (core/flow/deepDive.ts). With one there is
 * nothing to rotate to, nothing auto-updates and 2.2.2 does not apply — so
 * `viewFor` collapses that case to the list.
 */

/** Five seconds — VB-42 asks for this number by name. */
export const ROTATE_MS = 5000;

/**
 * A reason the clock is not running *right now*, and the only one left that is
 * temporary. Stopping for good is `RotationLife` — see the header.
 */
export type RotationHold = 'hover';

/**
 * Every way a person can touch the question, each of which ends the rotation
 * for good (docs/V2.0-REFINEMENT.md FLAG 1).
 *
 * Named individually rather than collapsed to a boolean for two reasons: the
 * surface has to say which gesture it saw, so a wiring that was never made is
 * a missing name rather than a silent gap; and `ROTATION_INTERACTIONS` below
 * lets the tests walk every one of them independently, which is what the task
 * asks to be proved.
 */
export type RotationInteraction =
  /** A click anywhere in the question area — a pill, the heading, blank space. */
  | 'click'
  /** Any keypress in the question area. */
  | 'key'
  /** Focus arriving anywhere in the question area, however it got there. */
  | 'focus'
  /** Typing an answer, or picking one. Adam's original VB-42 rule. */
  | 'typing'
  /** Opening a follow-up. */
  | 'open'
  /** Pressing rephrase. */
  | 'rephrase';

/** FLAG 1's list, in one place, so a test can walk it. */
export const ROTATION_INTERACTIONS: readonly RotationInteraction[] = [
  'click',
  'key',
  'focus',
  'typing',
  'open',
  'rephrase',
] as const;

/**
 * Whether this question's rotation has ended.
 *
 * A terminal state machine with one transition. `stopped` carries the reason
 * it stopped, which is not used to decide anything — it exists so that what
 * ended the motion is legible in a test and in a debugger rather than being
 * one anonymous boolean.
 */
export type RotationLife =
  | { readonly kind: 'running' }
  | { readonly kind: 'stopped'; readonly by: RotationInteraction };

/** Where every question starts. Frozen: it is shared by every caller. */
export const ROTATION_RUNNING: RotationLife = Object.freeze({ kind: 'running' as const });

/**
 * The one transition, and the whole of FLAG 1.
 *
 * Idempotent on purpose: a click that lands on a link that already has focus
 * is two interactions and one stop, and the FIRST reason is the one kept —
 * "what stopped it" means what stopped it, not what happened last.
 *
 * **There is deliberately no `resumeRotation`.** Nothing in this module
 * returns a stopped life to `running`; the only way back is a new question,
 * which is a new value because the surface mounts a new one. That is what
 * "never resumes when focus leaves, when a follow-up closes, or on a timer"
 * is made of — not a rule, an absence.
 */
export function stopRotation(life: RotationLife, by: RotationInteraction): RotationLife {
  return life.kind === 'stopped' ? life : { kind: 'stopped', by };
}

/** Whether the rotation has ended for this question. */
export function hasStopped(life: RotationLife): boolean {
  return life.kind === 'stopped';
}

/** What stopped it, or `null` while it is still running. */
export function stoppedBy(life: RotationLife): RotationInteraction | null {
  return life.kind === 'stopped' ? life.by : null;
}

export interface RotationInput {
  /** How many follow-ups this question has. */
  readonly count: number;
  /** What the surface asked for: 'one' rotates, 'all' is the static list. */
  readonly mode: 'one' | 'all';
  /** `prefers-reduced-motion: reduce`. */
  readonly reduced: boolean;
  readonly holds: readonly RotationHold[];
  /** Running, or stopped for good by an interaction. */
  readonly life: RotationLife;
}

/** What is on screen: one link at `index`, or every follow-up at once. */
export type FollowUpView =
  | { readonly kind: 'one'; readonly index: number }
  | { readonly kind: 'all' };

/** Wrap `index` into `count`, whatever either of them is. */
export function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  const wrapped = Math.trunc(index) % count;
  return wrapped < 0 ? wrapped + count : wrapped;
}

/** The next follow-up along, wrapping at the end. The list "keeps renewing". */
export function nextIndex(index: number, count: number): number {
  return clampIndex(index + 1, count);
}

/**
 * Whether this question is presented as one link at a time.
 *
 * **Deliberately blind to `life`.** A stopped rotation is still one follow-up
 * at a time, frozen where it was; it does not become the list. See the
 * header — a stop that reflows the page under the person is not a stop.
 */
export function showsOneAtATime(input: RotationInput): boolean {
  return input.mode === 'one' && !input.reduced && input.count > 1;
}

/** What to render. Anything that is not the rotating presentation is the list. */
export function viewFor(input: RotationInput, index: number): FollowUpView {
  if (!showsOneAtATime(input)) return { kind: 'all' };
  return { kind: 'one', index: clampIndex(index, input.count) };
}

/**
 * Whether the five-second clock should be running this instant.
 *
 * Three things have to agree: this is the rotating presentation, nothing has
 * ended it for good, and no hold is on it. Only the last of those can go back
 * to true on its own.
 */
export function isRunning(input: RotationInput): boolean {
  return showsOneAtATime(input) && !hasStopped(input.life) && input.holds.length === 0;
}
