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
 * `word`, not `text`. Somebody clicking "Dra" means Draft, and committing a
 * fragment would read as a bug in a box whose contents get sent verbatim.
 */

export type TypewriterPhase = 'typing' | 'holding' | 'erasing' | 'gap';

export interface TypewriterFrame {
  /** What is painted right now — a prefix of `word`, possibly empty. */
  text: string;
  /** The whole word this frame belongs to. What a click commits. */
  word: string;
  /** Which entry of the list, so a caller can key a render on it. */
  index: number;
  phase: TypewriterPhase;
  /** Whether the caret is lit this instant. */
  caret: boolean;
  /** Whether a click should be offered — see the header. */
  takeable: boolean;
}

/** Per character, going on. Slow enough to read as writing rather than a cut. */
export const TYPE_MS = 78;
/** Per character, coming off. Erasing is always faster than writing. */
export const ERASE_MS = 34;
/** Adam: "blink for like 1-2 seconds before it winds down." */
export const HOLD_MS = 1600;
/** Empty between two words, so they read as separate rather than as a morph. */
export const GAP_MS = 260;
/** Half a blink. Over HOLD_MS this gives the caret three flashes. */
export const BLINK_MS = 480;

/** How long one word owns the box, start to finish. */
export function cycleMs(word: string): number {
  return word.length * TYPE_MS + HOLD_MS + word.length * ERASE_MS + GAP_MS;
}

/** How long the whole list takes to come round again. */
export function loopMs(words: readonly string[]): number {
  return words.reduce((total, word) => total + cycleMs(word), 0);
}

/**
 * What is on screen `elapsed` milliseconds in. Loops forever.
 *
 * An empty list yields a still, empty, untakeable frame rather than throwing:
 * a caller that lost its content should render nothing, not crash a question.
 */
export function frameAt(elapsed: number, words: readonly string[]): TypewriterFrame {
  const still: TypewriterFrame = {
    text: '',
    word: '',
    index: 0,
    phase: 'gap',
    caret: false,
    takeable: false,
  };
  if (words.length === 0) return still;

  const loop = loopMs(words);
  // Negative time is treated as zero rather than wrapping to the end of the
  // loop — a clock that has not started yet should show the first frame.
  let t = elapsed <= 0 ? 0 : elapsed % loop;

  let index = 0;
  while (index < words.length && t >= cycleMs(words[index] as string)) {
    t -= cycleMs(words[index] as string);
    index += 1;
  }
  // Only reachable through floating-point drift on the modulo; the last word's
  // final frame is the honest answer.
  if (index >= words.length) index = words.length - 1;

  const word = words[index] as string;
  const typing = word.length * TYPE_MS;
  const holding = typing + HOLD_MS;
  const erasing = holding + word.length * ERASE_MS;

  if (t < typing) {
    const shown = Math.floor(t / TYPE_MS) + 1;
    const text = word.slice(0, Math.min(shown, word.length));
    // Solid while writing. A blink during typing reads as a fault, not a
    // cursor — this is the same rule every terminal follows.
    return { text, word, index, phase: 'typing', caret: true, takeable: text.length > 0 };
  }

  if (t < holding) {
    const into = t - typing;
    return {
      text: word,
      word,
      index,
      phase: 'holding',
      caret: Math.floor(into / BLINK_MS) % 2 === 0,
      takeable: true,
    };
  }

  if (t < erasing) {
    const gone = Math.floor((t - holding) / ERASE_MS) + 1;
    const text = word.slice(0, Math.max(word.length - gone, 0));
    return { text, word, index, phase: 'erasing', caret: true, takeable: text.length > 0 };
  }

  // The gap. Nothing painted, nothing to take, caret still there so the box
  // does not look switched off between words.
  return { text: '', word, index, phase: 'gap', caret: true, takeable: false };
}
