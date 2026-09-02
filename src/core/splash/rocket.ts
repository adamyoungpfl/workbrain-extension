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

/** The flight, end to end: press accepted to whiteout full. */
export const LAUNCH_MS = 1600;

/* The beats, all inside LAUNCH_MS. Read them as a storyboard: the screen
   clears to the dark field while the rocket arrives on it, the engine builds
   under a rumble, the climb throws it off the top, and the white it leaves
   behind floods the frame. */
/** The reveal has faded into the dark field by here. */
const COVER_MS = 260;
/** The rocket starts arriving while the field is still clearing — one event,
 *  not a queue of two. */
const MATERIALIZE_AT = 140;
const MATERIALIZE_MS = 360;
/** The engine lights and the rumble builds from here... */
const IGNITE_AT = 460;
/** ...until the hold-down lets go. */
const LIFTOFF_AT = 900;
/** Off the top of the frame this long after liftoff. */
const CLIMB_MS = 560;
/** The trail starts becoming the whiteout — while the rocket is still
 *  climbing, because the white is something it is LEAVING, not a curtain
 *  waiting for it to finish. */
const WHITE_AT = 1120;

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
