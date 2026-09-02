/**
 * V2.9 slice 4c — THE ROCKET (Adam, 2026-09-01).
 *
 * "On Launch button being clicked, I want to materialize a rocket that is
 * color on theme with the panel and the app as the rest of the buttons and
 * text and logos fade living only the dark background. The rocket should be
 * most lightly tones, with pops of color from the app pallets. The animation
 * is that as the rocket materializes and sort of visually rumbles and takes
 * off upwards, behind it, a trail of white becomes the whiteout that then
 * fades into the home page."
 *
 * The whole flight as a pure function of time since the launch was accepted.
 * No DOM, no rAF, no component — the panel asks this what to paint, exactly
 * as the reveal and the cable already work, one file over.
 *
 * ── ONE NUMBER, BY DECISION (docs/V2.9-SLICE-4-LAUNCH.md #2) ──────────────
 * The rumble, the climb and the whiteout sit between a press and the thing
 * the person pressed for, and they cannot be skipped because they ARE the
 * transition. So the show's whole length is `LAUNCH_MS` and every beat below
 * is inside it — re-timing the flight is editing this file and nothing else.
 * What follows the whiteout is not here: the splash's own fade (white into
 * Home) is the same exit every other door already takes.
 *
 * ── BOTH DOORS ARRIVE AT THIS CLOCK (decision #1) ─────────────────────────
 * "Which door you enter the rocket from" reads as both, and leaving the
 * splash is one moment however it is left. The launch door gets here through
 * the cable's pulse; the baseline doors get here directly. Same rocket.
 */
import { easeSmooth } from './sequence';

/** The flight, end to end: countdown start to whiteout full.
 *
 *  RETIMED 3000 (Adam, 2026-09-01): the hold-to-launch brief counts "3, 2,
 *  1" and takes "over the 3 second the entire screen to white" — so the
 *  flight IS the countdown's length now, the digits playing over it like
 *  mission control, and the whiteout landing exactly on zero. Still one
 *  number; the doc's decision #2 moves with it. */
export const LAUNCH_MS = 3000;

/* The beats, all inside LAUNCH_MS. Read them as a storyboard: the screen
   clears to the dark field while the rocket arrives on it, the engine builds
   under a rumble through "3" and "2", the climb throws it off the top on
   "1", and the white it leaves behind floods the frame at zero. */
/** The reveal has faded into the dark field by here. */
const COVER_MS = 300;
/** The rocket starts arriving while the field is still clearing — one event,
 *  not a queue of two. */
const MATERIALIZE_AT = 160;
const MATERIALIZE_MS = 480;
/** The engine lights and the rumble builds from here... */
const IGNITE_AT = 700;
/** ...until the hold-down lets go. */
const LIFTOFF_AT = 1900;
/** Off the top of the frame this long after liftoff. */
const CLIMB_MS = 800;
/** The trail starts becoming the whiteout — while the rocket is still
 *  climbing, because the white is something it is LEAVING, not a curtain
 *  waiting for it to finish. */
const WHITE_AT = 2200;

/**
 * The rumble's reach, in px. A shiver, not a wobble: the rocket is a small
 * drawing on a 400px panel, and at more than a couple of pixels the shake
 * stops reading as held-down thrust and starts reading as the panel broken.
 */
export const SHAKE_MAX = 2.4;

export interface RocketShow {
  /** How far the reveal has faded into the dark field, 0 to 1. */
  cover: number;
  /** The rocket's presence, 0 to 1. It never fades back out — it leaves. */
  rocket: number;
  /** Sideways shiver in px, zero before ignition and zero again in flight. */
  shake: number;
  /** The climb, 0 on the pad to 1 fully off the top of the frame. */
  climb: number;
  /** The engine's light, 0 cold to 1 full burn. */
  flame: number;
  /** The trail's presence, 0 to 1. */
  trail: number;
  /** The whiteout, 0 to 1 — exactly 1 at `LAUNCH_MS`, never past it. */
  white: number;
  /** The show is over; the hand-off may happen. */
  done: boolean;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/**
 * The rumble. Deterministic on purpose — a pure clock cannot roll dice, and
 * a flight that shakes the same way every launch is a flight a test can hold
 * still. Two sines at incommensurate periods read as noise at frame rate;
 * nobody watches a 1.6s shiver long enough to find the loop.
 *
 * The envelope is the physics: nothing before ignition, building while the
 * hold-down fights the thrust, and dying away as the rocket gets clean air —
 * a machine that still rattles once it is flying reads as coming apart.
 */
function shakeAt(ms: number): number {
  if (ms <= IGNITE_AT) return 0;
  const build = easeSmooth((ms - IGNITE_AT) / (LIFTOFF_AT - IGNITE_AT));
  const decay = 1 - easeSmooth((ms - LIFTOFF_AT) / (CLIMB_MS * 0.6));
  const envelope = Math.min(build, decay);
  /* Not merely an optimisation: a zero envelope times a negative sine is -0,
     which is a real value IEEE hands out and `Object.is` refuses to call 0.
     "Still" should mean still. */
  if (envelope <= 0) return 0;
  const jitter = Math.sin(ms * 0.19) + Math.sin(ms * 0.083);
  return SHAKE_MAX * envelope * (jitter / 2);
}

/** The flight, `ms` after the launch was accepted. */
export function rocketAt(ms: number): RocketShow {
  const t = Math.max(0, ms);

  const cover = easeSmooth(t / COVER_MS);
  const rocket = easeSmooth((t - MATERIALIZE_AT) / MATERIALIZE_MS);
  const flame = easeSmooth((t - IGNITE_AT) / (LIFTOFF_AT - IGNITE_AT));

  /* ACCELERATING, LIKE THE PULSE AND FOR THE SAME REASON. A rocket gathers
     speed — an eased-out climb would have it braking as it left, which reads
     as a drawing being slid off screen rather than as a thing departing under
     its own thrust. Squared time is the house curve for "gathering". */
  const climbP = clamp01((t - LIFTOFF_AT) / CLIMB_MS);
  const climb = climbP * climbP;

  const trail = t <= LIFTOFF_AT ? 0 : easeSmooth((t - LIFTOFF_AT) / 300);
  const white = t <= WHITE_AT ? 0 : easeSmooth((t - WHITE_AT) / (LAUNCH_MS - WHITE_AT));

  return {
    cover,
    rocket,
    shake: shakeAt(t),
    climb,
    flame,
    trail,
    white,
    done: t >= LAUNCH_MS,
  };
}

/* ── THE FOG (Adam, 2026-09-01) ──────────────────────────────────────────
   "Let's do a dissolve from white to the target screen… smoke then sort of
   digitally dematerializing like a fog disappearing to reveal either the
   home page or the baseline page based on whichever button they click."

   So the whiteout does not cut and it does not merely fade: it BECOMES fog,
   and the fog clears off the screen the person chose. The ordering is the
   whole point — the destination is opened UNDER the fog at the moment the
   whiteout is total, so what the clearing reveals is the place they are
   arriving rather than a screen still loading. That ordering fixed a real
   seam: the baseline route used to flash Home for however long the
   interview took to mount, because nothing was buying it the time. */

/** Solid white held before the first thinning. The destination is opened at
 *  the whiteout, but "opened" is not "painted": the interview reads its
 *  answers from storage before it renders at all (Flow returns null until
 *  then), and fog that starts clearing during that read clears onto the
 *  wrong screen. A held white frame is indistinguishable from a fog that has
 *  not started — so the hold is where the read hides. */
export const DISSOLVE_HOLD_MS = 180;
/** The clearing itself, hold's end to gone. */
export const DISSOLVE_MS = 700;

export interface Fog {
  /** How cleared the fog is, 0 solid white to 1 gone. */
  clear: number;
  /** The fog has cleared; the splash may unmount. */
  done: boolean;
}

/** The fog, `ms` after the whiteout was total. */
export function dissolveAt(ms: number): Fog {
  const into = ms - DISSOLVE_HOLD_MS;
  if (into <= 0) return { clear: 0, done: false };
  const p = Math.min(1, into / DISSOLVE_MS);
  return { clear: easeSmooth(p), done: into >= DISSOLVE_MS };
}

/* ── THE HOLD (Adam, 2026-09-01) ─────────────────────────────────────────
   "The button is one where when you hold it it loads for a couple of
   seconds. Make the circle outline grow in thickness and color brightness."

   Holding is the new press, for both actions: a launch is not a thing to
   trip over, and a ring that has to be charged is a confirmation that costs
   no dialog. Released early, the charge drains — faster than it filled,
   because an abort should feel like relief, not like rewinding a tape. */

/** Held this long, the key arms and the countdown begins. */
export const HOLD_MS = 1600;
/** A released charge drains to nothing in this long. */
export const DISCHARGE_MS = 260;

export interface Charge {
  /** How charged the ring is, 0 dark to 1 armed. */
  charge: number;
  /** The hold has completed. What happens next is not press-dependent. */
  armed: boolean;
}

/** The charge, `ms` into an unbroken hold. */
export function chargeAt(ms: number): Charge {
  if (ms <= 0) return { charge: 0, armed: false };
  const p = Math.min(1, ms / HOLD_MS);
  /* Smooth, not linear: the ring gathers confidence rather than filling a
     tank — and the last tenth visibly slows into the arm, which is the beat
     that lets somebody release in time if they were only leaning. */
  return { charge: easeSmooth(p), armed: p >= 1 };
}

/** The drain, from `from` charge, `ms` after an early release. */
export function dischargeAt(from: number, ms: number): number {
  if (ms <= 0) return from;
  return Math.max(0, from * (1 - ms / DISCHARGE_MS));
}

/* ── THE COUNTDOWN (Adam, 2026-09-01) ────────────────────────────────────
   "The button action counts down 3, 2, 1 and the background around
   everything but the countdown number fades to white."

   One clock for both routes. On the launch route the digits ride over the
   flight and the FLIGHT makes the white; on the baseline route there is no
   flight, and `white` here is the plain ride to the same surface. Both land
   on the identical full-white frame at the same instant, which is what lets
   the fog take over without knowing which door was held. */

/** The whole count — the flight's own length, on purpose (one number each,
 *  asserted equal by test rather than aliased, so a future retiming has to
 *  say which one it means). */
export const COUNTDOWN_MS = 3000;

export interface Count {
  /** The digit showing: 3, 2, 1. */
  digit: number;
  /** 0→1 through the current digit's second — the panel's pop curve. */
  digitP: number;
  /** The plain ride to white, for the route with no flight to make it. */
  white: number;
  /** Zero. The whiteout is total; the fog may take over. */
  done: boolean;
}

/** The count, `ms` after the key armed. */
export function countdownAt(ms: number): Count {
  const t = Math.max(0, Math.min(COUNTDOWN_MS, ms));
  const second = Math.min(2, Math.floor(t / 1000));
  return {
    digit: 3 - second,
    digitP: Math.min(1, (t - second * 1000) / 1000),
    white: easeSmooth(t / COUNTDOWN_MS),
    done: ms >= COUNTDOWN_MS,
  };
}
