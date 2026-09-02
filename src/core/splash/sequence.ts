/**
 * V2.7 VB-128 — the splash sequence's clock, pure and tested.
 *
 * Adam's decided choreography (docs/V2.7-SPLASH-WOW.md, confirmed
 * 2026-08-27): the show opens with drift, accelerates into the mark's
 * gravity, swells to white — a luminance swell, never a strobe — then the
 * movie-intro reveal: mark, wordmark, tagline, button. From the button's
 * appearance a ten-second count runs, dressed as a cycling loading line,
 * and the splash hands itself over to Home.
 *
 * The hand-off is a DELIBERATE return of VB-34's self-ending, recorded in
 * the doc: VB-73 removed it because the surface carried choices; it is a
 * show again, and a show that ends and hands over is a movie, not a door
 * slamming. Any click still exits instantly at every moment, and the
 * once-per-session law is untouched.
 *
 * Everything here is arithmetic over elapsed time so the panel's Splash can
 * stay a thin shell and the boundaries can be walked without a browser.
 */

export interface SplashBeats {
  /** Seconds from open: drift ends, the pull begins. */
  accelAt: number;
  /** The white swell starts rising. */
  swellAt: number;
  /** The swell has broken; the mark fades in on the settled field. */
  revealAt: number;
  /** The tagline joins. */
  taglineAt: number;
  /** The button lands — and the idle count starts HERE (decision 4). */
  enterAt: number;
  /** Idle milliseconds from `enterAt` until the hand-off (decision 4). */
  idleMs: number;
}

/** Reveal lands inside Adam's confirmed 4–5s window (decision 3) — pinned
 * by sequence.test.ts, so a later tuning pass cannot quietly drift it.
 * V2.8 VB-131: the idle count came down from ten seconds to six (Adam,
 * 2026-08-27) — the pin in the test moved with it. */
/* RETIMED 2026-09-02 (Adam, the cinematic open): the title card holds for
   a couple of counts after "by Model Citizen" — the admiration beat — and
   the fade to black runs a full second, "elegantly… without the messy
   blips of other screens". This SUPERSEDES decision 3's 4–5s reveal
   window, at his word; the pin in sequence.test.ts moved with it. */
export const SPLASH_BEATS: SplashBeats = {
  accelAt: 1.2,
  swellAt: 4.9,
  revealAt: 5.9,
  taglineAt: 6.6,
  enterAt: 7.2,
  idleMs: 6_000,
};

export type SplashPhase = 'show' | 'swell' | 'reveal';

/** Which of the three visual phases the clock is in. The fourth state —
 * gone, handed over — belongs to the caller's timer, not the clock. */
export function splashPhase(seconds: number, beats: SplashBeats = SPLASH_BEATS): SplashPhase {
  if (seconds < beats.swellAt) return 'show';
  if (seconds < beats.revealAt) return 'swell';
  return 'reveal';
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** Smoothstep — the one easing the sequence uses for its cross-fades. */
export function easeSmooth(v: number): number {
  const c = clamp01(v);
  return c * c * (3 - 2 * c);
}

/**
 * How hard the field is being pulled, 0 at rest rising steeply after
 * `accelAt` — the painter multiplies orbital speed by this. Dimensionless,
 * capped so the last pre-white frames are fast but drawable.
 */
export function pullStrength(seconds: number, beats: SplashBeats = SPLASH_BEATS): number {
  if (seconds <= beats.accelAt) return 0.16;
  const ramp = Math.min(3.4, (seconds - beats.accelAt) * 1.55);
  return 0.16 + ramp ** 1.7;
}

/**
 * The white layer's opacity: a swell up to full by `revealAt`'s doorstep,
 * then falling away over the reveal's first beats. Never a square wave —
 * the soft ramp IS the no-strobe decision, so it lives in core where a
 * test can hold it.
 */
export function swellOpacity(seconds: number, beats: SplashBeats = SPLASH_BEATS): number {
  if (seconds <= beats.swellAt) return 0;
  if (seconds < beats.revealAt) return easeSmooth((seconds - beats.swellAt) / (beats.revealAt - beats.swellAt));
  // Falls away across the mark's own fade-in.
  return 1 - easeSmooth((seconds - beats.revealAt) / (beats.taglineAt - beats.revealAt));
}

/** A reveal child's fade, 0–1, given its own start beat. */
export function revealAlpha(seconds: number, startAt: number, fadeSeconds = 0.6): number {
  return easeSmooth((seconds - startAt) / fadeSeconds);
}

/**
 * The cycling loading line (decision 5 — "action words cycling"): which
 * word the count is on. Wraps, so however long the ten seconds and the
 * word list drift apart, there is always a word.
 */
export function loadingWordIndex(msSinceEnter: number, wordCount: number, periodMs = 1400): number {
  if (wordCount <= 0) return 0;
  return Math.floor(Math.max(0, msSinceEnter) / periodMs) % wordCount;
}

/** How much of the idle count has drained, 0–1 — the thin bar under the
 * loading line. */
export function idleProgress(msSinceEnter: number, beats: SplashBeats = SPLASH_BEATS): number {
  return clamp01(msSinceEnter / beats.idleMs);
}
