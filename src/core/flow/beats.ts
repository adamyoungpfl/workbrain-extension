/**
 * V1.1 VB-05 — the pure half of the `beats` reveal.
 *
 * A `beats` array is an intro's timed, one-at-a-time read instead of one
 * dense paragraph: beat one shows, holds for roughly its own reading time,
 * fades out, beat two fades in, and it stops on the last one. The behaviour
 * is specified on `Step.beats` (src/schema/flow.types.ts) and, at more
 * length, on the source field it was ported from (src/core/flow/source.ts,
 * `beats`). The React half is src/panel/components/Beats.tsx; everything
 * that can be decided without a DOM is here, so it can be tested without one.
 *
 * PORTED, not invented — the sibling implementation
 * (`../modelcitizen/src/components/WorkBrainContextInterview.tsx`,
 * `renderEmphasized` / `beatHoldMs`) already shipped this mechanic. The
 * split-on-a-capturing-group parse, the 200wpm estimate, the flat two-second
 * buffer and the 400ms fade are all its numbers, kept identical so the two
 * implementations read at the same pace. See docs/CONTENT-SOURCES.md.
 *
 * The one deliberate difference: that implementation returns React nodes from
 * `renderEmphasized`. This returns plain data. `core/` may not touch the DOM
 * (docs/GUARDRAILS.md), and the segment list is what makes the markup
 * assertable in a unit test rather than only in a browser.
 */

/** One run of a beat's text. `emphasis` marks what `__double underscores__`
 * wrapped — rendered with a light underline treatment, never as markup: the
 * panel builds real React nodes from these, never `innerHTML`. */
export interface BeatSegment {
  text: string;
  emphasis: boolean;
}

/** A comfortable silent-reading estimate, plus a flat buffer — Adam's ask,
 * 2026-08-19: "2 seconds longer than it takes to read it". */
export const BEAT_WORDS_PER_MINUTE = 200;
export const BEAT_READ_BUFFER_MS = 2000;
/** How long the cross-fade between two beats takes. Also the delay between
 * "start fading out" and "swap in the next beat". */
export const BEAT_FADE_MS = 400;

/** Splitting on a capturing group alternates [text, match, text, match, …],
 * so odd indices are always the emphasized runs. Non-greedy, so two marked
 * spans in one beat stay two spans instead of swallowing the text between
 * them. An unclosed `__` is not a match and stays literal — a beat is never
 * markup being executed, it is a string being read. */
const EMPHASIS_SPLIT = /__(.+?)__/g;

/** A beat's text as runs of plain and emphasized text, in order. Empty runs
 * are dropped (splitting "__a__ b" yields a leading "") so a consumer can map
 * straight over the result without rendering empty nodes. */
export function parseBeat(beat: string): BeatSegment[] {
  return beat
    .split(EMPHASIS_SPLIT)
    .map((text, i) => ({ text, emphasis: i % 2 === 1 }))
    .filter((segment) => segment.text !== '');
}

/** One beat with its emphasis markers stripped — the plain-text equivalent
 * the source field requires stays available (narrator speech, and here the
 * screen-reader copy of a beat sequence that is still mid-play). */
export function beatPlainText(beat: string): string {
  return parseBeat(beat)
    .map((segment) => segment.text)
    .join('');
}

/** The whole sequence as one paragraph, matching how `source.ts` builds an
 * intro's `prompt()` fallback from the same array: joined with a space,
 * markers stripped. */
export function beatsPlainText(beats: readonly string[]): string {
  return beats.map(beatPlainText).join(' ');
}

/** How long a beat holds on screen before it starts fading out. Measured on
 * the plain text, so the two underscores around an emphasized word never
 * count as reading time. */
export function beatHoldMs(beat: string): number {
  const words = beatPlainText(beat).trim().split(/\s+/).filter(Boolean).length;
  return (words / BEAT_WORDS_PER_MINUTE) * 60000 + BEAT_READ_BUFFER_MS;
}
