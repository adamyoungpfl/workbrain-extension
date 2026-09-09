import { describe, expect, it } from 'vitest';
import { COUNT_TO, REVEAL_REST, REVEAL_SETTLED, partAt, partStartsAt } from './reveal';
import type { RevealPart } from './reveal';

/* THE DEVICE SUITES RETIRED WITH THE DEVICES (Adam, 2026-09-04) — their
   history rides in git. PASS 5A re-pinned this suite to Adam's new
   storyboard (2026-09-09): the white breaks onto the lockup and tagline
   ALREADY STANDING, the lockup glides to rest, the tagline glides to the
   acts' centre and hands the stage over, the beats play compressed, and
   the doors land — about five seconds, all told. */

const PARTS: RevealPart[] = ['lockup', 'tagline', 'time', 'privacy', 'baseline', 'launch'];

describe('partAt — the storyboard', () => {
  it('the white breaks onto the lockup and tagline already standing', () => {
    expect(partAt(0, 'lockup').opacity).toBe(1);
    expect(partAt(0, 'tagline').opacity).toBe(1);
    for (const part of ['time', 'privacy', 'baseline', 'launch'] as RevealPart[]) {
      expect(partAt(0, part).opacity).toBe(0);
    }
  });

  it('the lockup GLIDES up to its rest and never dims', () => {
    expect(partAt(0, 'lockup').y).toBeGreaterThan(0);
    let previousY = Number.POSITIVE_INFINITY;
    for (let t = 0; t <= 12; t += 0.05) {
      const p = partAt(t, 'lockup');
      expect(p.opacity).toBe(1);
      expect(p.y).toBeLessThanOrEqual(previousY + 1e-9);
      previousY = p.y;
    }
    expect(partAt(REVEAL_SETTLED, 'lockup').y).toBe(0);
  });

  it('the tagline is a PASSAGE: rides in standing, pauses at the centre, hands the stage over', () => {
    // In with the lockup, moving as one.
    expect(partAt(0, 'tagline').y).toBe(partAt(0, 'lockup').y);
    // A held breath at the centre, fully visible, after the glide.
    const mid = partAt(1.8, 'tagline');
    expect(mid.opacity).toBe(1);
    expect(mid.y).toBeGreaterThan(0);
    // Gone before the first beat is fully up, and gone for good.
    for (let t = 0; t <= 12; t += 0.02) {
      expect(Math.min(partAt(t, 'tagline').opacity, partAt(t, 'time').opacity)).toBeLessThanOrEqual(0.01);
    }
    expect(partAt(600, 'tagline').opacity).toBe(0);
  });

  it('never moves ANYTHING sideways — every part rides one centre line', () => {
    for (const part of PARTS) {
      for (let t = 0; t <= 10; t += 0.1) expect(partAt(t, part).x).toBe(0);
    }
  });

  it('plays one beat at a time — the section fades never overlap', () => {
    for (let t = 0; t <= 12; t += 0.02) {
      const a = partAt(t, 'time').opacity;
      const b = partAt(t, 'privacy').opacity;
      expect(Math.min(a, b)).toBeLessThanOrEqual(0.01);
    }
  });

  it('holds each beat solid long enough to read, inside the five-second budget', () => {
    for (const part of ['time', 'privacy'] as RevealPart[]) {
      let firstSolid = -1;
      let lastSolid = -1;
      for (let t = 0; t <= 12; t += 0.01) {
        if (partAt(t, part).opacity >= 0.999) {
          if (firstSolid < 0) firstSolid = t;
          lastSolid = t;
        }
      }
      expect(lastSolid - firstSolid).toBeGreaterThanOrEqual(0.45);
      expect(lastSolid - firstSolid).toBeLessThanOrEqual(1.2);
    }
  });

  it('never takes away the lockup or the doors', () => {
    for (const part of ['lockup', 'baseline', 'launch'] as RevealPart[]) {
      let previous = 0;
      for (let t = 0; t <= 12; t += 0.02) {
        const o = partAt(t, part).opacity;
        expect(o).toBeGreaterThanOrEqual(previous - 1e-9);
        previous = o;
      }
      expect(partAt(600, part).opacity).toBe(1);
    }
    // And the passage and the beats really are gone at the end.
    expect(partAt(600, 'tagline').opacity).toBe(0);
    expect(partAt(600, 'time').opacity).toBe(0);
    expect(partAt(600, 'privacy').opacity).toBe(0);
  });

  it('puts the doors LAST, after both beats have played — and they stick', () => {
    expect(partStartsAt('baseline')).toBeGreaterThan(partStartsAt('privacy'));
    expect(partAt(REVEAL_SETTLED, 'baseline').opacity).toBe(1);
    expect(partAt(REVEAL_SETTLED, 'launch').opacity).toBe(1);
    expect(partStartsAt('baseline')).toBeLessThan(partStartsAt('launch'));
  });

  it('takes about five seconds, as asked', () => {
    expect(REVEAL_SETTLED).toBeGreaterThanOrEqual(5);
    expect(REVEAL_SETTLED).toBeLessThanOrEqual(6);
  });

  it('never overshoots opacity, at any instant', () => {
    for (const part of PARTS) {
      for (let t = -1; t <= 12; t += 0.02) {
        const o = partAt(t, part).opacity;
        expect(o).toBeGreaterThanOrEqual(0);
        expect(o).toBeLessThanOrEqual(1);
      }
    }
  });

  describe('it comes to rest, and stays', () => {
    it('ends on the lockup and the doors — the tagline was a passage', () => {
      for (const part of ['lockup', 'baseline', 'launch'] as RevealPart[]) {
        const p = partAt(REVEAL_SETTLED, part);
        expect(p.opacity).toBe(1);
        expect(p.x).toBe(0);
        expect(p.y).toBe(0);
      }
      expect(partAt(REVEAL_SETTLED, 'tagline').opacity).toBe(0);
      expect(partAt(REVEAL_SETTLED, 'time').opacity).toBe(0);
      expect(partAt(REVEAL_SETTLED, 'privacy').opacity).toBe(0);
    });

    it('is byte-identical at the settle and long after — nothing drifts', () => {
      for (const part of PARTS) {
        expect(partAt(REVEAL_SETTLED + 30, part)).toEqual(partAt(REVEAL_SETTLED, part));
      }
    });

    it('REVEAL_REST is the settle — the parts are the only movers left', () => {
      expect(REVEAL_REST).toBe(REVEAL_SETTLED);
    });
  });
});

describe('the one surviving fact', () => {
  it('the copy still claims about fifteen minutes', () => {
    expect(COUNT_TO).toBe(15);
  });
});
