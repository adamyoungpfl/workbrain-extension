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
  /* The second section, and it settles slightly RIGHT of centre (Adam,
     2026-09-01: "the same treatment as the About 15 minutes but offset just
     slightly to the right"). The time section moved left at 4.2s; this one
     answers it, and the two offsets are what give the connector between them
     something to bend around — a path down a straight line is a rule, and a
     path that leans is a route. Fourteen against the other's sixteen: enough
     to read as deliberate, not enough to look like a mistake. */
  privacy: [
    { at: 3.8, opacity: 0, x: 0, y: 22 },
    { at: 4.5, opacity: 1, x: 14, y: 0 },
  ],
  /* THE TWO ACTIONS ARRIVE THE WAY THE SECTIONS DID (Adam, 2026-09-01: "In
     the same pattern as the sections above… Let's make that and the Launch
     offset at the bottom as the two action buttons"). One lands, then the
     other, and they lean opposite ways — the baseline answers the privacy
     section's right lean, the launch answers the baseline's left one, and
     the two squiggles between them have something to bend around. */
  baseline: [
    { at: 4.4, opacity: 0, x: 0, y: 14 },
    { at: 5.0, opacity: 1, x: -12, y: 0 },
  ],
  launch: [
    { at: 4.7, opacity: 0, x: 0, y: 14 },
    { at: 5.3, opacity: 1, x: 16, y: 0 },
  ],
};

/** When a part first has any presence at all — what the panel mounts on. */
export function partStartsAt(part: RevealPart): number {
  return SCRIPT[part][0]!.at;
}

/** When every part has finished moving. The still version renders this. */
export const REVEAL_SETTLED = 5.3;

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
export const ROLODEX_STARTS = 3.0;
/**
 * EXPORTED BECAUSE THE STYLESHEET NEEDS THE SAME NUMBER. The turn is drawn by
 * a CSS keyframe and counted here, and a duration written in both places is
 * one a re-timing changes in one of them. The panel hands this to the
 * stylesheet as a custom property; nothing hard-codes 620 anywhere else.
 */
export const ROLODEX_TURN_MS = 620;
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
export const CLAIM_WORDS = 4;
/** The last one is the true one, and the only one that never gets struck. */
export const CLAIM_TRUE = CLAIM_WORDS - 1;

/** Just after the section has landed, the way the rolodex follows its own. */
const CLAIM_STARTS = 4.6;
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
);

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
