/**
 * THE STARTER VERB, TYPING ITSELF (Adam, 2026-08-31).
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

export type TypewriterPhase = 'typing' | 'holding' | 'fading' | 'gap';

export interface TypewriterFrame {
  /** What is painted right now — a prefix of `seed`, possibly empty. */
  text: string;
  /** The whole example this frame belongs to. What a click commits. */
  seed: string;
  /** Which entry of the list, so a caller can key a render on it. */
  index: number;
  phase: TypewriterPhase;
  /** Whether the caret is lit this instant. */
  caret: boolean;
  /** 1 everywhere except the fade, where it walks down to 0. */
  opacity: number;
  /** Whether a click should be offered — see the header. */
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
/** The whole line fades at once, and this is why the exit is not a backspace.

    A verb could erase itself letter by letter and it was legible. A sentence
    cannot: at any per-character rate fast enough not to be tedious, the
    backspace reads as a glitch, and at a readable rate it takes longer to
    leave than it took to arrive. A fade removes the line as one object, which
    is what it is. */
export const FADE_MS = 420;
/** Empty between two examples, so they read as separate rather than as a morph. */
export const GAP_MS = 320;
/** Half a blink. Over HOLD_MS this gives the caret four flashes. */
export const BLINK_MS = 480;

/** How long one example owns the box, start to finish. */
export function cycleMs(seed: string): number {
  return seed.length * TYPE_MS + HOLD_MS + FADE_MS + GAP_MS;
}

/** How long the whole list takes to come round again. */
export function loopMs(seeds: readonly string[]): number {
  return seeds.reduce((total, seed) => total + cycleMs(seed), 0);
}

/**
 * What is on screen `elapsed` milliseconds in. Loops forever.
 *
 * An empty list yields a still, empty, untakeable frame rather than throwing:
 * a caller that lost its content should render nothing, not crash a question.
 */
export function frameAt(elapsed: number, seeds: readonly string[]): TypewriterFrame {
  const still: TypewriterFrame = {
    text: '',
    seed: '',
    index: 0,
    phase: 'gap',
    caret: false,
    opacity: 1,
    takeable: false,
  };
  if (seeds.length === 0) return still;

  const loop = loopMs(seeds);
  // Negative time is treated as zero rather than wrapping to the end of the
  // loop — a clock that has not started yet should show the first frame.
  let t = elapsed <= 0 ? 0 : elapsed % loop;

  let index = 0;
  while (index < seeds.length && t >= cycleMs(seeds[index] as string)) {
    t -= cycleMs(seeds[index] as string);
    index += 1;
  }
  // Only reachable through floating-point drift on the modulo; the last
  // example's final frame is the honest answer.
  if (index >= seeds.length) index = seeds.length - 1;

  const seed = seeds[index] as string;
  const typing = seed.length * TYPE_MS;
  const holding = typing + HOLD_MS;
  const fading = holding + FADE_MS;

  if (t < typing) {
    const shown = Math.floor(t / TYPE_MS) + 1;
    const text = seed.slice(0, Math.min(shown, seed.length));
    // Solid while writing. A blink during typing reads as a fault, not a
    // cursor — this is the same rule every terminal follows.
    return {
      text,
      seed,
      index,
      phase: 'typing',
      caret: true,
      opacity: 1,
      takeable: text.length > 0,
    };
  }

  if (t < holding) {
    const into = t - typing;
    return {
      text: seed,
      seed,
      index,
      phase: 'holding',
      caret: Math.floor(into / BLINK_MS) % 2 === 0,
      opacity: 1,
      takeable: true,
    };
  }

  if (t < fading) {
    /* THE WHOLE LINE, GOING. Still takeable the entire way down, which is
       Adam's own rule carried over from the verbs — live "until the same
       letter disappears as the word closes". A line at 20% opacity is still
       a line somebody can see and mean to click. */
    const gone = (t - holding) / FADE_MS;
    return {
      text: seed,
      seed,
      index,
      phase: 'fading',
      caret: false,
      opacity: 1 - gone,
      takeable: true,
    };
  }

  // The gap. Nothing painted, nothing to take, caret still there so the box
  // does not look switched off between examples.
  return { text: '', seed, index, phase: 'gap', caret: true, opacity: 1, takeable: false };
}
