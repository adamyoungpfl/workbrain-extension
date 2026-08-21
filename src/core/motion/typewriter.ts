/**
 * V1.2 VB-10 — the typewriter's arithmetic, with no clock, no DOM and no React.
 *
 * The panel has three typewriters now: the file tree's row labels (VB-07), the
 * question on every interview screen, and the module label in the status bar.
 * They differ only in *when* they start. What they all do — turn "how long ago
 * did this print start" into "how many characters are on screen" — is the same
 * arithmetic, and it is the part worth testing without a browser.
 *
 * Everything here is elapsed-time driven rather than tick-counting, and that is
 * the load-bearing choice:
 *
 *  - A tick that arrives late (a busy main thread, a throttled background
 *    window — Chrome clamps timers to one per second in a window it believes is
 *    occluded) reveals the characters it *should* have revealed by then rather
 *    than stretching a 600ms print into a minute.
 *  - A component that remounts mid-print — which `Flow` does on every question,
 *    see its `key={positionKey(position)}` — can resume the same print from the
 *    same start instant instead of restarting it. That is what makes the module
 *    label type once per module and not once per question, and it is exactly
 *    the mechanism BrandMark's `spinStartFor` uses for the same reason.
 */

/**
 * Milliseconds per character.
 *
 * The spec's number, not a re-derived one: VB-10 asks for ~8–12ms/char and
 * gives the reason — the interview is forty-nine questions, so even 400ms of
 * typing per question is twenty seconds of pure waiting across a pass. Ten is
 * the middle of the band. A 75-character question prints in 750ms; the longest
 * question in the shipped flow is under 1.2s.
 *
 * This is not one of docs/design-system.html §06's three durations, and it is
 * not meant to be: §06 governs how long a thing takes to *move* — a hover, a
 * transition, a sheet. This is a per-character rate, and the durations it
 * produces are a property of the sentence being printed. What §06 does govern
 * — that the motion is skippable and has a still equivalent — is honoured by
 * the hooks in src/panel/components/Typed.tsx.
 */
export const TYPE_SPEED_MS = 10;

/** How long a print of `length` characters takes, start to finish. */
export function typewriterDurationMs(length: number, speedMs: number = TYPE_SPEED_MS): number {
  if (!(length > 0)) return 0; // also catches NaN
  if (!(speedMs > 0)) return 0;
  return length * speedMs;
}

/**
 * How many characters are on screen `elapsedMs` into a print.
 *
 * Clamped at both ends, so a clock that runs backwards across a tab suspend
 * cannot produce a negative slice and a frame that arrives late cannot run past
 * the end of the string. A non-positive `speedMs` means "no rate at all", which
 * can only sensibly be the whole string at once.
 */
export function charsRevealedAt(
  elapsedMs: number,
  length: number,
  speedMs: number = TYPE_SPEED_MS,
): number {
  if (!(length > 0)) return 0;
  if (!(speedMs > 0)) return length;
  if (!(elapsedMs > 0)) return 0; // also catches NaN
  const revealed = Math.floor(elapsedMs / speedMs);
  return revealed >= length ? length : revealed;
}

/**
 * What a change-triggered typewriter remembers between mounts: the string it
 * last started printing, and when it started.
 */
export interface PrintCue {
  readonly cue: string;
  readonly startedAt: number;
}

/**
 * The cue's start instant — a new one if the cue has changed, the remembered
 * one if it has not.
 *
 * Pure, and deliberately *recording* rather than *consuming*: it answers "when
 * did this cue start" and never "has it changed since you last asked". The
 * difference matters because `<StrictMode>` invokes render bodies twice in
 * development, so a consuming flag would answer differently on the second call
 * and the label would print on some questions and not others. BrandMark's
 * `spinStartFor` makes the same argument for the same reason; this is that
 * function with its one impure line (the module-scope variable) lifted out to
 * the caller, so the decision itself can be tested without a browser.
 */
export function cueStartedAt(memory: PrintCue | null, cue: string, now: number): PrintCue {
  if (memory && memory.cue === cue) return memory;
  return { cue, startedAt: now };
}
