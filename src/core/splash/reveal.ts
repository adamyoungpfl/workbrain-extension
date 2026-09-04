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
  /* ACT A — the minutes. In by 2.2; the count runs 2.2→3.1, the rolodex
     turns 2.4→6.06 (three turns, core's own arithmetic below); out once
     the argument is complete. */
  time: [
    { at: 1.5, opacity: 0, x: 0, y: 18 },
    { at: 2.2, opacity: 1, x: 0, y: 0 },
    { at: 6.3, opacity: 1, x: 0, y: 0 },
    { at: 6.9, opacity: 0, x: 0, y: 0 },
  ],
  /* ACT B — the promise. In after A has fully left; the elimination runs
     8.0→11.65 (CLAIM_LANDS); a beat to be believed, then out. */
  privacy: [
    { at: 7.1, opacity: 0, x: 0, y: 18 },
    { at: 7.8, opacity: 1, x: 0, y: 0 },
    { at: 12.4, opacity: 1, x: 0, y: 0 },
    { at: 13.0, opacity: 0, x: 0, y: 0 },
  ],
  /* ACT C — the doors, with the OR between them, a beat apart. They stick. */
  baseline: [
    { at: 13.2, opacity: 0, x: 0, y: 12 },
    { at: 13.8, opacity: 1, x: 0, y: 0 },
  ],
  launch: [
    { at: 13.4, opacity: 0, x: 0, y: 12 },
    { at: 14.0, opacity: 1, x: 0, y: 0 },
  ],
};

/** When a part first has any presence at all — what the panel mounts on. */
export function partStartsAt(part: RevealPart): number {
  return SCRIPT[part][0]!.at;
}

/** When the LAST arrival has landed — the launch door, closing act C. The
 *  end state is the lockup, the tagline and the two doors; the acts have
 *  played and left. Nothing moves after this. */
export const REVEAL_SETTLED = 14.0;

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
/* Just after its section lands — retimed with the 2026-09-03 table. */
const COUNT_STARTS = 2.2;
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
export const ROLODEX_STARTS = 2.4;
/**
 * EXPORTED BECAUSE THE STYLESHEET NEEDS THE SAME NUMBER. The turn is drawn by
 * a CSS keyframe and counted here, and a duration written in both places is
 * one a re-timing changes in one of them. The panel hands this to the
 * stylesheet as a custom property; nothing hard-codes 620 anywhere else.
 */
export const ROLODEX_TURN_MS = 620;
/** Exported since the sequential grammar: act A's exit is timed off the
 *  last turn's END, and the test proving it needs the same arithmetic. */
export const ROLODEX_REST_MS = 900;
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

/* ── THE SECOND SECTION'S TWO CLAIMS ─────────────────────────────────────
   V2.9 slice 3b (Adam, 2026-09-01). This section gets the first section's
   treatment: a bold line with two words picked out in colour, and under it a
   quiet line with a device in it that runs and then stops.

   IT REPLACES THE ALTERNATING SLOT. Slice 3 had these two claims taking turns
   in one slot, and the reason was room — two sentences, space for one. Both
   are on screen together now, which costs one line of height and buys the
   thing the alternation could never have: they can be READ as a pair, and the
   second one can carry a device of its own. */

/**
 * "Nothing leaves your browser" — arrived at by ELIMINATION.
 *
 * Adam: "we use the flip on the word 'Nothing', we start with Everything then
 * Most Things then Some Things and finish on Nothing. For each wrong answer
 * the new word flips in and then gets crossed out and the crossed out word
 * flips over to the back as the new word flips in. Once it hits Nothing, it
 * stays solid, just like One question at a time stays solid in the above
 * section."
 *
 * So the claim is not asserted, it is ARRIVED AT. Three wrong answers are put
 * up and struck out in front of the person, and the true one is what is left
 * standing. A promise somebody watched three alternatives fail is a different
 * kind of promise from one printed on a screen.
 *
 * ── THE VERB TRAVELS WITH THE SUBJECT ─────────────────────────────────────
 * "Most things leaves your browser" is not English. The flipping slot holds
 * the subject AND its verb — "Most things leave", "Nothing leaves" — and the
 * static tail is "your browser." The alternative was subjects that all take a
 * singular verb ("Most of it", "Some of it"), which keeps the slot to one
 * word and costs the plainness of Adam's own words. The panel pins the slot
 * to its widest phrase so the tail never moves; see `SplashReveal.tsx`.
 */
/* Two, since the polish cut (Adam, 2026-09-01: "tighter on timing") — one
   refusal was always the whole argument; the other two were repetition. */
export const CLAIM_WORDS = 2;
/** The last one is the true one, and the only one that never gets struck. */
export const CLAIM_TRUE = CLAIM_WORDS - 1;

/** Just after act B has landed, the way the rolodex follows act A's. */
const CLAIM_STARTS = 8.0;
/* EVERY NUMBER BELOW IS ADAM'S, SET AT THE BENCH (2026-09-01) rather than
   argued for here: he scrubbed the device at real size and landed on these.
   The first pass had them at 310 / 400 / 240 / 240 and the whole run at 4.8s;
   his are slower and deliberately so — each wrong answer is now up long
   enough to be read, believed and then refused, which is the argument the
   device is making. The run is 8.0s and the screen stops at 12.9s. */
const CLAIM_IN_MS = 470;
const CLAIM_OUT_MS = 470;
/** Long enough to read a three-word phrase and believe it for a moment. */
const CLAIM_HOLD_MS = 800;
/** The line drawing itself across, left to right. */
const CLAIM_STRIKE_MS = 380;
/** Struck, and held there — the beat that says "no, not that one". */
const CLAIM_STRUCK_MS = 380;
/**
 * THE TRUE ONE IS UNDERLINED, NOT STRUCK (Adam, 2026-09-01: "make the last
 * strike be an underline for the word Nothing").
 *
 * The same gesture in the same place, inverted: three answers get a line
 * through them and the fourth gets a line under it. A different mark would
 * have been a different idea; the same mark, moved, is the device finishing
 * its own sentence. It is drawn in `--splash-answer` — warm rather than white,
 * because every other line on this screen is a rejection and this is the one
 * that is not.
 *
 * It waits a beat after the phrase lands: underlining a word the instant it
 * arrives reads as one movement, and the point is that the answer is what is
 * LEFT once the others have gone.
 */
const CLAIM_SETTLE_MS = 300;
/**
 * How far a phrase tips. The rolodex's own angle: same screen, same device,
 * and a card that leaves at a different angle from the one above it reads as
 * two mechanisms.
 */
export const CLAIM_ANGLE = 84;

const WRONG_MS = CLAIM_IN_MS + CLAIM_HOLD_MS + CLAIM_STRIKE_MS + CLAIM_STRUCK_MS + CLAIM_OUT_MS;

export interface ClaimWord {
  /** Which phrase, 0-based, into whatever copy the caller holds. */
  index: number;
  /** Degrees about the horizontal axis. 0 is face-on. */
  rotate: number;
  /** 0 absent, 1 fully present. */
  opacity: number;
  /** How far the line is drawn THROUGH it, 0 to 1. Wrong answers only. */
  strike: number;
  /** How far the line is drawn UNDER its first word, 0 to 1. The true one only. */
  underline: number;
  /** The true one has landed, its line is drawn, and nothing will move again. */
  resting: boolean;
}

/**
 * OPACITY IS A FUNCTION OF THE ROTATION, not a second curve running beside it.
 *
 * A card that fades on its own schedule can be half-lit while face-on, or
 * solid while edge-on — both of which read as a bug rather than as a card.
 * Tied to the angle there is one truth: face-on is legible, edge-on is gone,
 * and the smoothstep keeps it readable through the first half of the tip and
 * takes it out quickly at the end, where a smear would give the trick away.
 */
function faceOpacity(rotate: number): number {
  return easeSmooth(1 - Math.abs(rotate) / CLAIM_ANGLE);
}

/**
 * The phrase showing, `t` seconds into the reveal, and how it is standing.
 *
 * Each wrong phrase gets the same five beats: it arrives, it is read, it is
 * struck, it is held struck, and it falls away carrying its line with it. The
 * next arrives out of the same edge the last left through, which is what makes
 * three separate answers read as one slot being corrected rather than three
 * unrelated lines.
 */
export function claimWordAt(t: number): ClaimWord {
  const inS = CLAIM_IN_MS / 1000;
  const holdS = CLAIM_HOLD_MS / 1000;
  const strikeS = CLAIM_STRIKE_MS / 1000;
  const struckS = CLAIM_STRUCK_MS / 1000;
  const outS = CLAIM_OUT_MS / 1000;
  const wrongS = WRONG_MS / 1000;

  if (t <= CLAIM_STARTS) {
    // Waiting in the wings, tipped back and invisible — so the first arrival
    // is an arrival rather than a fade-up from nothing.
    return { index: 0, rotate: CLAIM_ANGLE, opacity: 0, strike: 0, underline: 0, resting: false };
  }

  const into = t - CLAIM_STARTS;
  const index = Math.min(CLAIM_TRUE, Math.floor(into / wrongS));
  const within = into - index * wrongS;

  if (index === CLAIM_TRUE) {
    // The true one arrives, waits a beat, is underlined, and stays. No strike,
    // no exit, nothing after it.
    const settleS = CLAIM_SETTLE_MS / 1000;
    const p = Math.min(1, within / inS);
    const rotate = CLAIM_ANGLE * (1 - easeSmooth(p));
    const since = within - inS - settleS;
    const underline = since <= 0 ? 0 : Math.min(1, easeSmooth(since / strikeS));
    return {
      index,
      rotate,
      opacity: faceOpacity(rotate),
      strike: 0,
      underline,
      resting: underline >= 1,
    };
  }

  if (within < inS) {
    const rotate = CLAIM_ANGLE * (1 - easeSmooth(within / inS));
    return { index, rotate, opacity: faceOpacity(rotate), strike: 0, underline: 0, resting: false };
  }
  if (within < inS + holdS) {
    return { index, rotate: 0, opacity: 1, strike: 0, underline: 0, resting: false };
  }
  if (within < inS + holdS + strikeS) {
    return {
      index,
      rotate: 0,
      opacity: 1,
      strike: easeSmooth((within - inS - holdS) / strikeS),
      underline: 0,
      resting: false,
    };
  }
  if (within < inS + holdS + strikeS + struckS) {
    return { index, rotate: 0, opacity: 1, strike: 1, underline: 0, resting: false };
  }
  // Falling away over the top, still struck: the correction leaves with it.
  const p = easeSmooth((within - inS - holdS - strikeS - struckS) / outS);
  const rotate = -CLAIM_ANGLE * p;
  return { index, rotate, opacity: faceOpacity(rotate), strike: 1, underline: 0, resting: false };
}

/** The moment the true claim has arrived AND been underlined — the last thing
 *  on this screen to stop. */
export const CLAIM_LANDS =
  CLAIM_STARTS +
  (CLAIM_TRUE * WRONG_MS + CLAIM_IN_MS + CLAIM_SETTLE_MS + CLAIM_STRIKE_MS) / 1000;

/**
 * THE MOMENT NOTHING IS MOVING ANY MORE — the last turn finished, the true
 * claim landed, every part at rest.
 *
 * Distinct from `REVEAL_SETTLED`, which is when the PARTS stop moving and is
 * what the still frame renders. The sections keep living for a few seconds
 * after that, and this is when they stop. Derived rather than typed, so it
 * cannot go stale: a re-timing of either device moves it.
 */
export const REVEAL_REST = Math.max(
  /* The last TURN ending, not the rest period after it: the rolodex spends its
     final 900ms already still, and counting that would put the moment nothing
     moves nearly a second after nothing was moving. */
  ROLODEX_STARTS +
    ((ROLODEX_TURNS - 1) * (ROLODEX_TURN_MS + ROLODEX_REST_MS) + ROLODEX_TURN_MS) / 1000,
  CLAIM_LANDS,
  /* And the last ARRIVAL: under the sequential grammar (2026-09-03) the
     doors land after both acts have played, so the parts themselves are
     the final movers. */
  REVEAL_SETTLED,
);

/* THE CONNECTORS ARE GONE (Adam, 2026-09-03, the simplification): the
   squiggle routes between sections — and the grown OR pair — left with the
   choreography they existed to trace. `linkAt` and `orPairAt` lived here;
   git has them if a route is ever wanted back. */
