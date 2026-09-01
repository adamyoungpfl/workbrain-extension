/**
 * THE SEED EXAMPLES, TYPING THEMSELVES INTO A STACK (Adam, 2026-09-01).
 *
 * The baseline box used to hold a static "e.g. Draft my Monday status
 * update…" placeholder. A placeholder is the weakest teacher on any form: it
 * vanishes at the exact moment somebody engages with the thing it was
 * teaching. This replaces it with a verb that types itself out, holds while
 * its caret blinks, erases, and gives way to the next one — and which can be
 * TAKEN, so the cheapest possible path into this box already starts with a
 * command.
 *
 * ── WHY THE TIMING IS A PURE FUNCTION OF ELAPSED TIME ─────────────────────
 * Not a chain of setTimeouts advancing a state machine. `frameAt(ms)` is
 * total — hand it any instant and it says exactly what is on screen — which
 * makes every phase boundary a unit test instead of something you can only
 * watch for. The panel owns one interval and asks this what to paint. It also
 * means the animation cannot drift, desynchronise, or leave a timer running
 * against an unmounted component holding a half-erased word.
 *
 * ── WHAT THE CLICK TARGET IS, AND WHEN ────────────────────────────────────
 * Adam: "the link should stay clickable on the final word from the first
 * letter that creates the word until the same letter disappears as the word
 * closes." That is exactly `text.length > 0` — live from the first character
 * painted, through the hold, until the last character is erased, dark only in
 * the gap between words. `frameAt` reports it as `takeable` so the panel does
 * not re-derive the rule.
 *
 * Taking it yields the WHOLE word, never the two letters currently painted:
 * `seed`, not `text`. Somebody clicking a half-written line means the whole
 * line, and committing a fragment into a box that gets sent verbatim would
 * read as a bug.
 */

export type TypewriterPhase = 'typing' | 'holding';

/** One line in the stack. */
export interface TypewriterLine {
  /** The whole example. What a click on this line commits. */
  seed: string;
  /** What is painted — the full seed on every line but the newest. */
  text: string;
  /** Which entry of the list, so a render can key on it. */
  index: number;
  /** 0 is the line being written; each step up is one line further down. */
  age: number;
  /** Where this line sits on the fade ladder. */
  opacity: number;
  /** Only ever on the newest line. */
  caret: boolean;
  phase: TypewriterPhase;
  /** Whether a click should be offered on this line. */
  takeable: boolean;
}

/* THE TIMINGS ARE SET FOR A SENTENCE, NOT A WORD. The first build cycled six
   verbs and could afford 78ms a character; a fifty-character example at that
   rate takes four seconds to appear, which is long enough that somebody stops
   waiting and starts typing over it. */

/** Per character, going on. Fast enough to finish a sentence in under two
 *  seconds, slow enough to still read as writing rather than as a cut. */
export const TYPE_MS = 30;
/** Long enough to READ what appeared, which a single verb never needed. */
export const HOLD_MS = 2200;
/** Half a blink. Over HOLD_MS this gives the caret four flashes. */
export const BLINK_MS = 480;

/**
 * THE FADE LADDER, and why the exit stopped being a fade-in-place.
 *
 * A completed example no longer disappears where it stands. It stays, the next
 * one is written above it, and it descends — dimming one rung per line until
 * it is gone. Adam: "expired lines fade to white after 3-4 lines. Just
 * something to keep ideas flowing."
 *
 * That is a better thing than a single line cycling, and not only visually.
 * One line at a time means the only example somebody can act on is the one
 * that happens to be on screen at the instant they decide to act; a stack
 * means the last three are all still there and all still clickable. The
 * animation stopped being decoration and became a short list with a memory.
 *
 * Four rungs, because the fourth is already near enough to the ground to read
 * as leaving rather than as content.
 */
export const OPACITY_BY_AGE: readonly number[] = [1, 0.46, 0.22, 0.09];

/** How many lines the stack ever holds. */
export const MAX_LINES = OPACITY_BY_AGE.length;

/** How long one example spends being written and held. */
export function cycleMs(seed: string): number {
  return seed.length * TYPE_MS + HOLD_MS;
}

/** How long the whole list takes to come round again. */
export function loopMs(seeds: readonly string[]): number {
  return seeds.reduce((total, seed) => total + cycleMs(seed), 0);
}

/**
 * The stack `elapsed` milliseconds in, newest first. Loops forever.
 *
 * An empty list yields an empty stack rather than throwing: a caller that lost
 * its content should render nothing, not crash a question.
 */
export function linesAt(elapsed: number, seeds: readonly string[]): TypewriterLine[] {
  if (seeds.length === 0) return [];

  const loop = loopMs(seeds);
  // Negative time is treated as zero rather than wrapping to the end of the
  // loop — a clock that has not started yet should show the first frame.
  const clamped = elapsed <= 0 ? 0 : elapsed;
  let t = clamped % loop;
  /* Whether the list has come round yet. On the very first pass there IS no
     history, so the stack builds up from one line instead of opening with
     three examples nobody was shown. After that the wrap is real history. */
  const firstPass = clamped < loop;

  let index = 0;
  while (index < seeds.length && t >= cycleMs(seeds[index] as string)) {
    t -= cycleMs(seeds[index] as string);
    index += 1;
  }
  // Only reachable through floating-point drift on the modulo.
  if (index >= seeds.length) index = seeds.length - 1;

  const seed = seeds[index] as string;
  const typing = seed.length * TYPE_MS;

  const newest: TypewriterLine =
    t < typing
      ? {
          seed,
          text: seed.slice(0, Math.min(Math.floor(t / TYPE_MS) + 1, seed.length)),
          index,
          age: 0,
          opacity: 1,
          // Solid while writing. A blink during typing reads as a fault, not
          // a cursor — the same rule every terminal follows.
          caret: true,
          phase: 'typing',
          takeable: true,
        }
      : {
          seed,
          text: seed,
          index,
          age: 0,
          opacity: 1,
          caret: Math.floor((t - typing) / BLINK_MS) % 2 === 0,
          phase: 'holding',
          takeable: true,
        };

  const lines: TypewriterLine[] = [newest];
  for (let age = 1; age < MAX_LINES; age += 1) {
    const back = index - age;
    // No phantom history on the first pass through the list.
    if (firstPass && back < 0) break;
    const at = ((back % seeds.length) + seeds.length) % seeds.length;
    const older = seeds[at] as string;
    lines.push({
      seed: older,
      text: older,
      index: at,
      age,
      opacity: OPACITY_BY_AGE[age] as number,
      caret: false,
      phase: 'holding',
      /* EVERY VISIBLE LINE IS TAKEABLE, including the dim ones. This is the
         point of keeping them: somebody who recognises the example from two
         lines ago should not have to wait a full loop for it to come back. */
      takeable: true,
    });
  }
  return lines;
}
