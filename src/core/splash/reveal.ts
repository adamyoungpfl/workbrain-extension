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
  /* PASS 5A (Adam, 2026-09-09): "When the white fades to black, I want
     the logo lockup and tagline to stay full visible through the
     transition. However, I want the logo lockup to slowly move to its
     final position and for the tagline to slowly move to the center
     position to then fade out and be replaced by the 15 minute beat,
     then the Nothing moves beat, then the final action buttons to
     enter… I want the whole thing to take about 5 seconds total."

     So the white BREAKS onto both already standing (opacity 1 at zero -
     continuity with the stage they rode in on), the lockup GLIDES up to
     its rest (the rest itself a little lower now - the css gives the
     part its extra margin, since the tagline's row is only a passage),
     and the tagline glides to the acts' centre, holds a breath, and
     hands the stage to the beats. The acts' holds compressed to fit the
     five-second budget. */
  lockup: [
    { at: 0.0, opacity: 1, x: 0, y: 104 },
    { at: 1.5, opacity: 1, x: 0, y: 0 },
  ],
  tagline: [
    { at: 0.0, opacity: 1, x: 0, y: 104 },
    { at: 1.5, opacity: 1, x: 0, y: 56 },
    { at: 2.0, opacity: 1, x: 0, y: 56 },
    { at: 2.3, opacity: 0, x: 0, y: 56 },
  ],
  /* The minutes - a single beat, budgeted to the five seconds. */
  time: [
    { at: 2.35, opacity: 0, x: 0, y: 12 },
    { at: 2.7, opacity: 1, x: 0, y: 0 },
    { at: 3.3, opacity: 1, x: 0, y: 0 },
    { at: 3.65, opacity: 0, x: 0, y: 0 },
  ],
  /* The promise - the same single beat. */
  privacy: [
    { at: 3.7, opacity: 0, x: 0, y: 12 },
    { at: 4.05, opacity: 1, x: 0, y: 0 },
    { at: 4.65, opacity: 1, x: 0, y: 0 },
    { at: 4.95, opacity: 0, x: 0, y: 0 },
  ],
  /* The doors, a beat apart. They stick. */
  baseline: [
    { at: 5.0, opacity: 0, x: 0, y: 12 },
    { at: 5.4, opacity: 1, x: 0, y: 0 },
  ],
  launch: [
    { at: 5.15, opacity: 0, x: 0, y: 12 },
    { at: 5.55, opacity: 1, x: 0, y: 0 },
  ],
};

/** When a part first has any presence at all — what the panel mounts on. */
export function partStartsAt(part: RevealPart): number {
  return SCRIPT[part][0]!.at;
}

/** When the LAST arrival has landed — the launch door. The end state is
 *  the lockup and the doors; the tagline was a PASSAGE (5a) and the acts
 *  have played and left. Nothing moves after this. */
export const REVEAL_SETTLED = 5.55;

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
