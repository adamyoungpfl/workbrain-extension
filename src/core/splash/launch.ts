/**
 * V2.9 slice 4b — THE PULSE THROUGH THE CABLE (Adam, 2026-09-01).
 *
 * "Below the Launch Button when dormant, should look like a simple control
 * panel button in the modern theme and aesthetic of the site. It should have a
 * 'cable' that is attached to it that is glowing faintly. When the launch
 * button is hit, the animation is a pulse coming through the wire, into the
 * button and then the fade out and rocket sequence."
 *
 * Where the light is along the wire, as a pure function of time since the
 * press. No DOM, no rAF, no component — the panel asks this what to paint,
 * exactly as the reveal's own choreography works one file over.
 *
 * ── IT IS A CLOCK, NOT A PROMISE ──────────────────────────────────────────
 * Nothing here decides whether the hand-off happens; it only says how far the
 * light has travelled. The press has already been accepted by the time the
 * first frame is painted, which is the difference between a button that
 * acknowledges you and one that thinks about it. `arrived` is the moment the
 * light reaches the button and the next thing may begin — slice 4c's rocket,
 * and until then the fade this screen already had.
 */
import { easeSmooth } from './sequence';

/**
 * How long the light takes to travel the wire.
 *
 * SHORT ON PURPOSE. This sits between somebody pressing a button and getting
 * the thing they pressed it for, and a press is a promise the interface makes
 * back — the whole point of the cable is that the promise is VISIBLE, not that
 * it takes a while. Four hundred milliseconds is long enough to read as travel
 * and short enough that nobody waits through it.
 */
export const PULSE_MS = 420;

export interface Pulse {
  /** How far along the wire the light is, 0 at the far end to 1 at the button. */
  travelled: number;
  /** The light has reached the button. What happens next may begin. */
  arrived: boolean;
}

/**
 * The light's position, `ms` after the press.
 *
 * ACCELERATING, NOT EASING TO A STOP. A pulse in a wire is current arriving,
 * so it is fastest where it lands — an ease-out would have the light creeping
 * the last few pixels into the button, which reads as something running out
 * rather than something being delivered. Squared time is the cheapest curve
 * that does it and the one the eye reads as "gathering".
 */
export function pulseAt(ms: number): Pulse {
  if (ms <= 0) return { travelled: 0, arrived: false };
  const p = Math.min(1, ms / PULSE_MS);
  return { travelled: p * p, arrived: p >= 1 };
}

/**
 * How lit the wire is at rest, given a fraction through its own slow breath.
 *
 * Adam asked for "glowing faintly", which is a state rather than an event: the
 * cable is live before anybody touches it, and a cable that is perfectly
 * static reads as a drawn line rather than as something with power in it. The
 * breath is small — a tenth either side of a low base — because a pulsing
 * light beside two doors would compete with the decision the doors are for.
 */
export const IDLE_GLOW_MS = 3200;
export function idleGlowAt(ms: number): number {
  const turn = ((ms % IDLE_GLOW_MS) + IDLE_GLOW_MS) % IDLE_GLOW_MS;
  /* Up for the first half, down for the second — one continuous breath rather
     than a sawtooth that would snap dark at the wrap. */
  const half = IDLE_GLOW_MS / 2;
  const rising = turn < half;
  const p = rising ? turn / half : 1 - (turn - half) / half;
  return 0.34 + 0.16 * easeSmooth(p);
}
