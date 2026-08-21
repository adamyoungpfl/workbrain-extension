import { describe, it, expect } from 'vitest';
import { ease } from './easing';

/**
 * The JS copy of `cubic-bezier(.2,0,0,1)` has to agree with the CSS one, or
 * the product ends up with two accelerations that look almost the same and
 * never quite match. These pin the curve's shape, not just its endpoints.
 */
describe('ease — the §06 curve', () => {
  it('starts at 0 and ends at 1', () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
  });

  it('clamps outside 0..1 rather than running past the end state', () => {
    expect(ease(-0.5)).toBe(0);
    expect(ease(2)).toBe(1);
    expect(ease(Number.NaN)).toBe(0);
  });

  it('rises monotonically — nothing it drives may ever go backwards', () => {
    let previous = -1;
    for (let i = 0; i <= 200; i++) {
      const value = ease(i / 200);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it('is front-loaded: more than half the distance is covered in the first quarter', () => {
    // This is the curve's whole character — it leaves fast and settles slow.
    // A symmetric ease would put ~0.16 here, so the assertion fails loudly if
    // the control points are ever transcribed the wrong way round.
    expect(ease(0.25)).toBeGreaterThan(0.5);
    expect(ease(0.5)).toBeGreaterThan(0.85);
    expect(ease(0.9)).toBeGreaterThan(0.99);
  });

  it('inverts x(t) accurately — the curve passes through its own known points', () => {
    // Solved independently: at t = 0.5, x = 0.6·0.5·0.25 + 0.125 = 0.2,
    // and y = 3·0.25 − 2·0.125 = 0.5. So ease(0.2) must be 0.5.
    expect(ease(0.2)).toBeCloseTo(0.5, 6);
  });
});
