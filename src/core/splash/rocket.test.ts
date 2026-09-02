import { describe, expect, it } from 'vitest';
import {
  COUNTDOWN_MS,
  DISCHARGE_MS,
  DISSOLVE_HOLD_MS,
  DISSOLVE_MS,
  HOLD_MS,
  LAUNCH_MS,
  SHAKE_MAX,
  chargeAt,
  countdownAt,
  dischargeAt,
  dissolveAt,
  rocketAt,
} from './rocket';

describe('rocketAt — the flight is one clock', () => {
  it('opens dark and still: nothing has moved at zero', () => {
    const at0 = rocketAt(0);
    expect(at0.cover).toBe(0);
    expect(at0.rocket).toBe(0);
    expect(at0.shake).toBe(0);
    expect(at0.climb).toBe(0);
    expect(at0.flame).toBe(0);
    expect(at0.trail).toBe(0);
    expect(at0.white).toBe(0);
    expect(at0.done).toBe(false);
    // A frame handed a negative time is the frame before the press landed.
    expect(rocketAt(-50)).toEqual(at0);
  });

  it('ends exactly once, at the one number the decision named', () => {
    expect(rocketAt(LAUNCH_MS - 1).done).toBe(false);
    expect(rocketAt(LAUNCH_MS).done).toBe(true);
    expect(rocketAt(LAUNCH_MS + 5000).done).toBe(true);
  });

  it('is fully white when it ends — the hand-off happens inside the whiteout', () => {
    /* The splash's own fade takes over from here, white into Home. If the
       whiteout were still short of 1 at `done`, the fade would start from a
       frame with a dark edge in it and the cut would be visible. */
    expect(rocketAt(LAUNCH_MS).white).toBe(1);
    expect(rocketAt(LAUNCH_MS * 2).white).toBe(1);
  });

  it('the reveal is gone before the rocket is fully there', () => {
    /* "The rest of the buttons and text and logos fade leaving only the dark
       background" — the clearing and the arrival overlap, but the field must
       finish clearing first or the rocket materialises over half-faded
       doors. */
    let covered = 0;
    for (let ms = 0; ms <= LAUNCH_MS; ms += 5) {
      if (rocketAt(ms).cover >= 1) {
        covered = ms;
        break;
      }
    }
    expect(covered).toBeGreaterThan(0);
    expect(rocketAt(covered).rocket).toBeLessThan(1);
  });

  it('the rocket materialises and never fades back out — it leaves instead', () => {
    let last = 0;
    for (let ms = 0; ms <= LAUNCH_MS; ms += 5) {
      const now = rocketAt(ms).rocket;
      expect(now).toBeGreaterThanOrEqual(last);
      last = now;
    }
    expect(last).toBe(1);
  });

  it('rumbles on the pad, not before ignition and not in flight', () => {
    /* The envelope is the physics: nothing until the engine lights, building
       while the hold-down fights the thrust, gone once it has clean air — a
       machine still rattling in flight reads as coming apart. */
    for (let ms = 0; ms <= 700; ms += 10) expect(rocketAt(ms).shake).toBe(0);
    let peak = 0;
    for (let ms = 0; ms <= LAUNCH_MS; ms += 1) {
      peak = Math.max(peak, Math.abs(rocketAt(ms).shake));
    }
    expect(peak).toBeGreaterThan(SHAKE_MAX * 0.5);
    expect(peak).toBeLessThanOrEqual(SHAKE_MAX);
    // Clean air: still by the time the whiteout is flooding the frame.
    for (let ms = 2400; ms <= LAUNCH_MS; ms += 10) {
      expect(rocketAt(ms).shake).toBe(0);
    }
  });

  it('the climb ACCELERATES rather than easing to a stop', () => {
    /* A rocket gathers speed. An ease-out would have it braking as it left,
       which reads as a drawing slid off screen rather than a departure. */
    const at = (p: number) => rocketAt(1900 + 800 * p).climb;
    const early = at(0.2) - at(0.1);
    const late = at(1.0) - at(0.9);
    expect(late).toBeGreaterThan(early * 3);
    let last = -1;
    for (let ms = 0; ms <= LAUNCH_MS; ms += 5) {
      const now = rocketAt(ms).climb;
      expect(now).toBeGreaterThanOrEqual(last);
      last = now;
    }
    expect(last).toBe(1);
  });

  it('the rocket is off the top before the whiteout is full', () => {
    let gone = 0;
    for (let ms = 0; ms <= LAUNCH_MS; ms += 5) {
      if (rocketAt(ms).climb >= 1) {
        gone = ms;
        break;
      }
    }
    expect(gone).toBeGreaterThan(0);
    expect(rocketAt(gone).white).toBeLessThan(1);
  });

  it('the trail follows the liftoff, and the white grows out of the trail', () => {
    /* The order IS the brief: "behind it, a trail of white becomes the
       whiteout". Trail before white, both monotone, no step backwards for a
       dropped frame to land on. */
    expect(rocketAt(1900).trail).toBe(0);
    expect(rocketAt(2000).trail).toBeGreaterThan(0);
    expect(rocketAt(2000).white).toBe(0);
    expect(rocketAt(2200).white).toBe(0);
    expect(rocketAt(2400).white).toBeGreaterThan(0);
    let lastTrail = -1;
    let lastWhite = -1;
    for (let ms = 0; ms <= LAUNCH_MS; ms += 5) {
      const now = rocketAt(ms);
      expect(now.trail).toBeGreaterThanOrEqual(lastTrail);
      expect(now.white).toBeGreaterThanOrEqual(lastWhite);
      lastTrail = now.trail;
      lastWhite = now.white;
    }
  });

  it('the fog holds solid first — the beat the destination paints behind', () => {
    for (let ms = -40; ms <= DISSOLVE_HOLD_MS; ms += 10) {
      expect(dissolveAt(ms)).toEqual({ clear: 0, done: false });
    }
  });

  it('then clears monotonically, and is gone exactly once', () => {
    const whole = DISSOLVE_HOLD_MS + DISSOLVE_MS;
    let last = -1;
    for (let ms = 0; ms <= whole; ms += 5) {
      const now = dissolveAt(ms).clear;
      expect(now).toBeGreaterThanOrEqual(last);
      expect(now).toBeLessThanOrEqual(1);
      last = now;
    }
    expect(last).toBe(1);
    expect(dissolveAt(whole - 1).done).toBe(false);
    expect(dissolveAt(whole).done).toBe(true);
    expect(dissolveAt(whole * 5)).toEqual({ clear: 1, done: true });
  });

  it('the hold charges smoothly, arms exactly once, and drains faster than it filled', () => {
    expect(chargeAt(0)).toEqual({ charge: 0, armed: false });
    expect(chargeAt(-50)).toEqual({ charge: 0, armed: false });
    let last = -1;
    for (let ms = 0; ms <= HOLD_MS; ms += 5) {
      const now = chargeAt(ms);
      expect(now.charge).toBeGreaterThanOrEqual(last);
      expect(now.charge).toBeLessThanOrEqual(1);
      last = now.charge;
    }
    expect(last).toBe(1);
    expect(chargeAt(HOLD_MS - 1).armed).toBe(false);
    expect(chargeAt(HOLD_MS).armed).toBe(true);
    /* An abort should feel like relief: whatever was charged is gone inside
       the discharge window, never below zero, from any starting point. */
    expect(DISCHARGE_MS).toBeLessThan(HOLD_MS / 2);
    for (const from of [0.2, 0.6, 0.999]) {
      expect(dischargeAt(from, 0)).toBe(from);
      expect(dischargeAt(from, DISCHARGE_MS)).toBe(0);
      expect(dischargeAt(from, DISCHARGE_MS * 3)).toBe(0);
      expect(dischargeAt(from, DISCHARGE_MS / 2)).toBeLessThan(from);
    }
  });

  it('counts 3, 2, 1 — a second each — and lands white exactly on zero', () => {
    /* The count and the flight are the same length ON PURPOSE (the digits
       ride over the flight; the whiteout lands on zero). Asserted equal
       rather than aliased, so a future retiming has to say which it means. */
    expect(COUNTDOWN_MS).toBe(LAUNCH_MS);

    expect(countdownAt(0).digit).toBe(3);
    expect(countdownAt(999).digit).toBe(3);
    expect(countdownAt(1000).digit).toBe(2);
    expect(countdownAt(1999).digit).toBe(2);
    expect(countdownAt(2000).digit).toBe(1);
    expect(countdownAt(COUNTDOWN_MS).digit).toBe(1);

    let lastWhite = -1;
    for (let ms = 0; ms <= COUNTDOWN_MS; ms += 5) {
      const now = countdownAt(ms);
      expect(now.white).toBeGreaterThanOrEqual(lastWhite);
      expect(now.digitP).toBeGreaterThanOrEqual(0);
      expect(now.digitP).toBeLessThanOrEqual(1);
      lastWhite = now.white;
    }
    expect(lastWhite).toBe(1);
    expect(countdownAt(COUNTDOWN_MS - 1).done).toBe(false);
    expect(countdownAt(COUNTDOWN_MS).done).toBe(true);
    expect(countdownAt(COUNTDOWN_MS * 2)).toMatchObject({ digit: 1, white: 1, done: true });
  });

  it('every value a frame paints is finite and in range, at any time at all', () => {
    /* The panel writes these straight to style. NaN in an opacity is an
       invisible rocket; NaN in a transform is a rocket nowhere. */
    for (const ms of [-100, 0, 1, 699, 701, 1899, 1901, 2199, 2201, LAUNCH_MS, 10_000]) {
      const f = rocketAt(ms);
      for (const v of [f.cover, f.rocket, f.climb, f.flame, f.trail, f.white]) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      expect(Number.isFinite(f.shake)).toBe(true);
      expect(Math.abs(f.shake)).toBeLessThanOrEqual(SHAKE_MAX);
    }
  });
});
