import { describe, expect, it } from 'vitest';
import { IDLE_GLOW_MS, PULSE_MS, idleGlowAt, pulseAt } from './launch';

describe('pulseAt — the light travelling the wire', () => {
  it('is at the far end before the press', () => {
    expect(pulseAt(0)).toEqual({ travelled: 0, arrived: false });
    expect(pulseAt(-50)).toEqual({ travelled: 0, arrived: false });
  });

  it('arrives exactly once, at the end of its own length', () => {
    expect(pulseAt(PULSE_MS - 1).arrived).toBe(false);
    expect(pulseAt(PULSE_MS).arrived).toBe(true);
    expect(pulseAt(PULSE_MS + 5000).arrived).toBe(true);
  });

  it('never runs past the button, however late the frame', () => {
    // A dropped frame must not put the light beyond the thing it is arriving
    // at — the panel draws this straight onto a path length.
    for (const ms of [PULSE_MS, PULSE_MS * 2, 60_000]) {
      expect(pulseAt(ms).travelled).toBe(1);
    }
  });

  it('ACCELERATES rather than easing to a stop', () => {
    /* A pulse in a wire is current arriving, so it is fastest where it lands.
       An ease-out would have the light creeping the last few pixels into the
       button, which reads as something running out rather than as something
       being delivered. */
    const early = pulseAt(PULSE_MS * 0.2).travelled - pulseAt(PULSE_MS * 0.1).travelled;
    const late = pulseAt(PULSE_MS).travelled - pulseAt(PULSE_MS * 0.9).travelled;
    expect(late).toBeGreaterThan(early * 3);
    // And it is behind a straight line the whole way, which is what that means.
    for (let p = 0.05; p < 1; p += 0.05) {
      expect(pulseAt(PULSE_MS * p).travelled).toBeLessThan(p);
    }
  });

  it('moves the whole way, monotonically', () => {
    let last = -1;
    for (let ms = 0; ms <= PULSE_MS; ms += 5) {
      const now = pulseAt(ms).travelled;
      expect(now).toBeGreaterThanOrEqual(last);
      last = now;
    }
    expect(last).toBe(1);
  });
});

describe('idleGlowAt — the cable is live before anybody touches it', () => {
  it('never goes out, and never gets bright enough to compete', () => {
    for (let ms = 0; ms < IDLE_GLOW_MS * 3; ms += 17) {
      const glow = idleGlowAt(ms);
      expect(glow).toBeGreaterThan(0.3);
      expect(glow).toBeLessThan(0.55);
    }
  });

  it('breathes — one rise and one fall per turn, with no snap at the wrap', () => {
    /* A sawtooth would cut to dark as it wrapped, which reads as a fault in
       the wire rather than as a wire with power in it. */
    expect(idleGlowAt(0)).toBeCloseTo(idleGlowAt(IDLE_GLOW_MS), 6);
    expect(idleGlowAt(IDLE_GLOW_MS / 2)).toBeGreaterThan(idleGlowAt(0));
    expect(idleGlowAt(IDLE_GLOW_MS - 1)).toBeCloseTo(idleGlowAt(1), 2);
  });

  it('is the same at any point in any turn — nothing accumulates', () => {
    for (const ms of [0, 500, 1700, 3199]) {
      expect(idleGlowAt(ms)).toBeCloseTo(idleGlowAt(ms + IDLE_GLOW_MS * 5), 9);
    }
  });
});
