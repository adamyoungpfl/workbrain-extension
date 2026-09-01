import { easeSmooth } from './sequence';

/**
 * V2.9 — THE REVEAL'S CHOREOGRAPHY (Adam, 2026-09-02). Slice 1 of 4.
 *
 * What is on screen after the white breaks, where it is, and how solid — as a
 * pure function of elapsed time. No DOM, no rAF, no component: the panel asks
 * this what to paint and paints it.
 *
 * ── WHY THE TIMING IS A TABLE AND NOT A CHAIN OF TRANSITIONS ──────────────
 * The sequence Adam described has parts that MOVE WHILE OTHERS FADE, and a
 * connector that re-routes when a section shifts. Expressed as CSS transitions
 * that is a dozen elements each holding a piece of the truth, and no way to
 * ask "what does this look like at 2.4 seconds" except to sit and watch it at
 * 2.4 seconds. Expressed as keyframes it is one table, every beat is a unit
 * test, and re-timing the whole show is editing numbers in one place.
 *
 * It also means the still version is free: hand `partAt` a time past the end
 * and every part is at its resting place, which is exactly what reduced motion
 * needs to render.
 *
 * ── WHAT SLICE 1 DOES NOT DO ──────────────────────────────────────────────
 * Nothing is drawn here. The counter knows it counts 30 down to 15, not what
 * typeface it is in; the connector knows where it starts and ends, not that it
 * glows. Slices 2–4 draw. This is the thing they all agree with.
 */

/** The parts of the reveal, in the order they arrive. */
export type RevealPart = 'lockup' | 'tagline' | 'time' | 'privacy' | 'doors';

export interface Placed {
  /** 0 absent, 1 fully present. */
  opacity: number;
  /** Offset from the part's own resting place, in px. Negative y is up. */
  x: number;
  y: number;
}

interface Key extends Placed {
  /** Seconds from the reveal starting. */
  at: number;
}

/**
 * THE TABLE. Seconds from the moment the white breaks.
 *
 * Read it as a storyboard: the lockup arrives alone in the middle, rises as
 * the tagline joins it, and both rise again as each section materialises
 * beneath them — Adam's "they both keep moving up as the next section
 * materializes". The time section then moves "up and slightly to the left",
 * which is the shift the connector has to follow.
 *
 * ── THE DOORS LAND AT 4.4s, AND THAT IS A JUDGEMENT ───────────────────────
 * Adam's sequence, taken strictly in order, puts the buttons after the second
 * section has finished cycling two messages — twelve to fifteen seconds before
 * anything is pressable, against 5.5 today. Any click still skips the show,
 * but the DEFAULT would be a long hold on somebody who came to do a thing.
 *
 * So the doors arrive while the sections carry on living underneath them. The
 * cinema plays; nobody is trapped in it. It is one number if that is the wrong
 * call, which is the reason it is a number and not a chain of `.then()`s.
 */
const SCRIPT: Record<RevealPart, Key[]> = {
  // Fades in centred, then climbs twice — once for the tagline, once for the
  // sections. It never moves sideways: it is the thing everything else is
  // arranged around.
  lockup: [
    { at: 0.0, opacity: 0, x: 0, y: 0 },
    { at: 0.7, opacity: 1, x: 0, y: 0 },
    /* HELD IN THE MIDDLE until the tagline starts. Adam: "the logo lockup
       fades into the black in the middle of the frame. THEN it starts to move
       AS the tagline fades into place below it." The first table had it rising
       the instant its own fade ended, which makes the movement a continuation
       of the arrival rather than a response to the line joining it — and the
       spec's own "then" is doing real work there. Caught by the test that
       asserted it was still centred while alone. */
    { at: 0.9, opacity: 1, x: 0, y: 0 },
    { at: 1.6, opacity: 1, x: 0, y: -46 },
    { at: 2.5, opacity: 1, x: 0, y: -104 },
  ],
  // Arrives under the lockup while the lockup is already rising, so the two
  // read as one object gaining a second line rather than as two arrivals.
  tagline: [
    { at: 0.9, opacity: 0, x: 0, y: 0 },
    { at: 1.6, opacity: 1, x: 0, y: 0 },
    { at: 2.5, opacity: 1, x: 0, y: -58 },
  ],
  // "About 15 minutes" — materialises, then moves up and slightly LEFT.
  time: [
    { at: 1.9, opacity: 0, x: 0, y: 26 },
    { at: 2.6, opacity: 1, x: 0, y: 0 },
    { at: 3.5, opacity: 1, x: 0, y: 0 },
    { at: 4.2, opacity: 1, x: -16, y: -34 },
  ],
  // The second section, right of centre, linked to the first.
  privacy: [
    { at: 3.8, opacity: 0, x: 0, y: 22 },
    { at: 4.5, opacity: 1, x: 0, y: 0 },
  ],
  doors: [
    { at: 4.4, opacity: 0, x: 0, y: 14 },
    { at: 5.0, opacity: 1, x: 0, y: 0 },
  ],
};

/** When a part first has any presence at all — what the panel mounts on. */
export function partStartsAt(part: RevealPart): number {
  return SCRIPT[part][0]!.at;
}

/** When every part has finished moving. The still version renders this. */
export const REVEAL_SETTLED = 5.0;

/**
 * Where a part is, `t` seconds into the reveal.
 *
 * Before its first keyframe it is at that keyframe (absent, in position);
 * after its last it stays there forever. Nothing loops and nothing drifts —
 * a reveal that is still moving when somebody is deciding is a reveal
 * competing with its own buttons.
 */
export function partAt(t: number, part: RevealPart): Placed {
  const keys = SCRIPT[part];
  const first = keys[0]!;
  const last = keys[keys.length - 1]!;
  if (t <= first.at) return { opacity: first.opacity, x: first.x, y: first.y };
  if (t >= last.at) return { opacity: last.opacity, x: last.x, y: last.y };

  for (let i = 1; i < keys.length; i += 1) {
    const b = keys[i]!;
    if (t > b.at) continue;
    const a = keys[i - 1]!;
    const span = b.at - a.at;
    // Eased, not linear: these are objects arriving and settling, and a linear
    // move reads as a slide rather than as something coming to rest.
    const p = span <= 0 ? 1 : easeSmooth((t - a.at) / span);
    return {
      opacity: a.opacity + (b.opacity - a.opacity) * p,
      x: a.x + (b.x - a.x) * p,
      y: a.y + (b.y - a.y) * p,
    };
  }
  return { opacity: last.opacity, x: last.x, y: last.y };
}

/* ── THE COUNTER ─────────────────────────────────────────────────────────── */

/** Adam: "it streams down from 30 minutes quickly to 15." */
export const COUNT_FROM = 30;
export const COUNT_TO = 15;
const COUNT_STARTS = 2.6;
const COUNT_MS = 900;

/**
 * The number showing, `t` seconds in.
 *
 * Held at 30 until the section has arrived, so the count is something the
 * person watches happen rather than something already over by the time they
 * look. Eased so it arrives at 15 and stops dead rather than creeping the last
 * few digits — a counter that decelerates forever reads as broken.
 */
export function countAt(t: number): number {
  if (t <= COUNT_STARTS) return COUNT_FROM;
  const p = Math.min(1, (t - COUNT_STARTS) / (COUNT_MS / 1000));
  return Math.round(COUNT_FROM + (COUNT_TO - COUNT_FROM) * easeSmooth(p));
}

/* ── THE ROLODEX ─────────────────────────────────────────────────────────── */

/** Adam: "have the entire question seem to rotate like a rolodex". */
const ROLODEX_STARTS = 3.0;
const ROLODEX_TURN_MS = 620;
const ROLODEX_REST_MS = 900;
/**
 * THREE TURNS, THEN STILL — a deliberate departure from "shows the same thing
 * on a loop".
 *
 * A permanent animation on a screen that is asking somebody to choose keeps
 * pulling the eye back to a line that has already said everything it has to
 * say, and it competes with the doors for exactly as long as the person is
 * deciding. Three turns is enough to be seen and understood as a device; a
 * fourth is the screen fidgeting.
 */
export const ROLODEX_TURNS = 3;

export interface Rolodex {
  /** Which turn, 0-based. */
  turn: number;
  /** 0 to 1 through the current turn; 0 while resting. */
  progress: number;
  /** Whether it is mid-turn right now. */
  turning: boolean;
}

export function rolodexAt(t: number): Rolodex {
  const cycle = (ROLODEX_TURN_MS + ROLODEX_REST_MS) / 1000;
  if (t <= ROLODEX_STARTS) return { turn: 0, progress: 0, turning: false };
  const into = t - ROLODEX_STARTS;
  const turn = Math.floor(into / cycle);
  if (turn >= ROLODEX_TURNS) {
    return { turn: ROLODEX_TURNS - 1, progress: 0, turning: false };
  }
  const withinS = into - turn * cycle;
  const turning = withinS < ROLODEX_TURN_MS / 1000;
  return {
    turn,
    progress: turning ? withinS / (ROLODEX_TURN_MS / 1000) : 0,
    turning,
  };
}

/* ── THE TWO PRIVACY LINES ───────────────────────────────────────────────── */

/**
 * Adam: "'The file is yours from start to finish' and then it fades out and is
 * replaced by 'Nothing leaves your browser' fading in and then out."
 *
 * They alternate rather than ending on nothing. Two claims that both matter,
 * in a space with room for one — an empty slot between them would read as a
 * section that had finished and left.
 */
export const PRIVACY_LINES = 2;
const LINE_STARTS = 4.5;
const LINE_FADE_MS = 420;
const LINE_HOLD_MS = 1800;

export interface PrivacyLine {
  /** Which line, 0-based, into whatever copy the caller holds. */
  index: number;
  opacity: number;
}

export function privacyLineAt(t: number): PrivacyLine {
  const fade = LINE_FADE_MS / 1000;
  const hold = LINE_HOLD_MS / 1000;
  const cycle = fade * 2 + hold;
  if (t <= LINE_STARTS) return { index: 0, opacity: 0 };
  const into = t - LINE_STARTS;
  const index = Math.floor(into / cycle) % PRIVACY_LINES;
  const within = into - Math.floor(into / cycle) * cycle;
  if (within < fade) return { index, opacity: within / fade };
  if (within < fade + hold) return { index, opacity: 1 };
  return { index, opacity: Math.max(0, 1 - (within - fade - hold) / fade) };
}

/* ── THE CONNECTOR ───────────────────────────────────────────────────────── */

export interface Link {
  /** How much of the path is drawn, 0 to 1. */
  drawn: number;
  /** Where the glowing head is along it, 0 to 1. */
  head: number;
  /** Nothing to draw at all. */
  idle: boolean;
}

/**
 * The glowing path between two sections.
 *
 * It draws itself just ahead of the section it points at, so the eye is led
 * INTO something arriving rather than shown a line to something already
 * there — which is the whole reason a connector is better than a gap.
 *
 * The path's geometry is not here: it depends on where the two parts actually
 * are, and `partAt` already says. Slice 2 computes the curve from those two
 * points, which is what makes it follow the time section when it moves left.
 */
export function linkAt(t: number, toPart: RevealPart): Link {
  const arrives = partStartsAt(toPart);
  const from = arrives - 0.45;
  const span = 0.7;
  if (t <= from) return { drawn: 0, head: 0, idle: true };
  const p = Math.min(1, (t - from) / span);
  return { drawn: easeSmooth(p), head: p, idle: false };
}
