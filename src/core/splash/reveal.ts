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
export type RevealPart = 'lockup' | 'tagline' | 'time' | 'privacy' | 'baseline' | 'launch';

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
 * SEQUENTIAL (Adam, 2026-09-03, refining his own simplification of the
 * same day: "have the (A) About 15 Minutes section fade in and then out,
 * then (B) have the THE FILE IS YOURS section fade it and then out, then
 * (C) have the action buttons with the OR fade in. Each fades in, goes
 * through its animation to completion then fades out until the buttons
 * and then they stick until click.")
 *
 * So the reveal is now three ACTS under a standing lockup: the logo and
 * tagline hold the top; the minutes play their whole argument (the count
 * streams down, the rolodex takes its three turns) and leave; the promise
 * plays its whole argument (the elimination lands and underlines) and
 * leaves; the doors arrive with the OR and stand until pressed. One act
 * on stage at a time — the fades never overlap.
 *
 * THIS SUPERSEDES THE DOORS-EARLY JUDGEMENT, at Adam's word. From slice 1
 * the doors landed while the sections argued beneath them, so nobody
 * waited on the cinema; "they stick until click" puts them after the acts
 * by explicit direction. Any click anywhere still skips the whole show —
 * the cinema is longer, and still optional.
 */
const SCRIPT: Record<RevealPart, Key[]> = {
  // The logo — the shipped icon's own face — fades in first, and stands.
  lockup: [
    { at: 0.0, opacity: 0, x: 0, y: 0 },
    { at: 0.7, opacity: 1, x: 0, y: 0 },
  ],
  // Arrives under it while the lockup is still solidifying, so the two read
  // as one object gaining a second line rather than as two arrivals.
  tagline: [
    { at: 0.4, opacity: 0, x: 0, y: 0 },
    { at: 1.1, opacity: 1, x: 0, y: 0 },
  ],
  /* ACT A — the minutes, a SINGLE BEAT (Adam, 2026-09-04: "fade in and
     then solid for 2 seconds or so, enough time to read it once, and then
     fade out", "using the final version"). No counter, no rolodex — the
     settled line, read once, gone. */
  time: [
    { at: 1.4, opacity: 0, x: 0, y: 14 },
    { at: 2.0, opacity: 1, x: 0, y: 0 },
    { at: 4.0, opacity: 1, x: 0, y: 0 },
    { at: 4.6, opacity: 0, x: 0, y: 0 },
  ],
  /* ACT B — the promise, the same single beat: the answer already
     underlined, read once, gone. */
  privacy: [
    { at: 4.8, opacity: 0, x: 0, y: 14 },
    { at: 5.4, opacity: 1, x: 0, y: 0 },
    { at: 7.4, opacity: 1, x: 0, y: 0 },
    { at: 8.0, opacity: 0, x: 0, y: 0 },
  ],
  /* ACT C — the doors, with the OR between them, a beat apart. They stick. */
  baseline: [
    { at: 8.2, opacity: 0, x: 0, y: 12 },
    { at: 8.8, opacity: 1, x: 0, y: 0 },
  ],
  launch: [
    { at: 8.4, opacity: 0, x: 0, y: 12 },
    { at: 9.0, opacity: 1, x: 0, y: 0 },
  ],
};

/** When a part first has any presence at all — what the panel mounts on. */
export function partStartsAt(part: RevealPart): number {
  return SCRIPT[part][0]!.at;
}

/** When the LAST arrival has landed — the launch door, closing act C. The
 *  end state is the lockup, the tagline and the doors; the acts have
 *  played and left. Nothing moves after this. */
export const REVEAL_SETTLED = 9.0;

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

/* ── THE DEVICES, RETIRED (Adam, 2026-09-04) ─────────────────────────────
   "just have the 15 minute and Nothing leaves sections to be a single
   beat that fades in and out, using the final version."

   The counter that streamed 30 down to 15, the rolodex's three turns, and
   the elimination that struck two wrong answers before underlining
   Nothing — all retired together. Each section now IS its final version:
   ABOUT 15 MINUTES over its quiet line, and the promise with Nothing
   already underlined. `countAt`, `rolodexAt`, `claimWordAt` and their
   constants lived here; git has them with the shows they ran. What
   survives is the one fact the copy interpolates: */
export const COUNT_TO = 15;

/** The moment nothing is moving any more. With the devices retired the
 *  parts are the only movers, so this IS the settle — kept as its own
 *  name because the still frame and the specs reason in terms of "rest". */
export const REVEAL_REST = REVEAL_SETTLED;
