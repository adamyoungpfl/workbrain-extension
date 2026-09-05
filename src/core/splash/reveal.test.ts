import { describe, expect, it } from 'vitest';
import { COUNT_TO, REVEAL_REST, REVEAL_SETTLED, partAt, partStartsAt } from './reveal';
import type { RevealPart } from './reveal';

/* THE DEVICE SUITES RETIRED WITH THE DEVICES (Adam, 2026-09-04: "just have
   the 15 minute and Nothing leaves sections to be a single beat that fades
   in and out, using the final version"). countAt's stream, rolodexAt's
   three turns and claimWordAt's elimination — and every test that proved
   them — are in git with the shows they ran. What remains under test is
   the one thing left moving: the parts. */

const PARTS: RevealPart[] = ['lockup', 'tagline', 'time', 'privacy', 'baseline', 'launch'];

describe('partAt — the storyboard', () => {
  it('arrives in the order Adam described', () => {
    const order = [...PARTS].sort((a, b) => partStartsAt(a) - partStartsAt(b));
    expect(order.slice(0, 3)).toEqual(['lockup', 'tagline', 'time']);
    expect(partStartsAt('privacy')).toBeGreaterThan(partStartsAt('time'));
  });

  it('starts with nothing on screen', () => {
    for (const part of PARTS) expect(partAt(0, part).opacity).toBe(0);
  });

  it('opens on the lockup leading, the tagline joining while it solidifies', () => {
    const at = 0.6;
    const lockup = partAt(at, 'lockup');
    const tagline = partAt(at, 'tagline');
    expect(lockup.opacity).toBeGreaterThan(tagline.opacity);
    expect(tagline.opacity).toBeGreaterThan(0);
    expect(partAt(at, 'time').opacity).toBe(0);
  });

  it('never moves ANYTHING sideways — every part rides one centre line', () => {
    for (const part of PARTS) {
      for (let t = 0; t <= 10; t += 0.1) expect(partAt(t, part).x).toBe(0);
    }
  });

  it('plays one act at a time — the section fades never overlap', () => {
    for (let t = 0; t <= 12; t += 0.02) {
      const a = partAt(t, 'time').opacity;
      const b = partAt(t, 'privacy').opacity;
      expect(Math.min(a, b)).toBeLessThanOrEqual(0.01);
    }
  });

  it('holds each act SOLID for about two seconds — enough to read it once', () => {
    /* Adam (2026-09-04): "fade in and then solid for 2 seconds or so".
       Measured as the span each act spends at full presence. */
    for (const part of ['time', 'privacy'] as RevealPart[]) {
      let firstSolid = -1;
      let lastSolid = -1;
      for (let t = 0; t <= 12; t += 0.01) {
        if (partAt(t, part).opacity >= 0.999) {
          if (firstSolid < 0) firstSolid = t;
          lastSolid = t;
        }
      }
      expect(lastSolid - firstSolid).toBeGreaterThanOrEqual(1.8);
      expect(lastSolid - firstSolid).toBeLessThanOrEqual(2.6);
    }
  });

  it('never takes away the lockup, the tagline or the doors', () => {
    for (const part of ['lockup', 'tagline', 'baseline', 'launch'] as RevealPart[]) {
      let previous = 0;
      for (let t = 0; t <= 12; t += 0.02) {
        const o = partAt(t, part).opacity;
        expect(o).toBeGreaterThanOrEqual(previous - 1e-9);
        previous = o;
      }
      expect(partAt(600, part).opacity).toBe(1);
    }
    // And the acts really are gone at the end.
    expect(partAt(600, 'time').opacity).toBe(0);
    expect(partAt(600, 'privacy').opacity).toBe(0);
  });

  it('puts the doors LAST, after both acts have played — and they stick', () => {
    expect(partStartsAt('baseline')).toBeGreaterThan(partStartsAt('privacy'));
    expect(partAt(REVEAL_SETTLED, 'baseline').opacity).toBe(1);
    expect(partAt(REVEAL_SETTLED, 'launch').opacity).toBe(1);
    expect(partStartsAt('baseline')).toBeLessThan(partStartsAt('launch'));
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
    it('ends on the lockup, the tagline and the doors', () => {
      for (const part of ['lockup', 'tagline', 'baseline', 'launch'] as RevealPart[]) {
        expect(partAt(REVEAL_SETTLED, part).opacity).toBe(1);
      }
      expect(partAt(REVEAL_SETTLED, 'time').opacity).toBe(0);
      expect(partAt(REVEAL_SETTLED, 'privacy').opacity).toBe(0);
    });

    it('is byte-identical at the settle and long after — nothing drifts', () => {
      for (const part of PARTS) {
        expect(partAt(REVEAL_SETTLED + 30, part)).toEqual(partAt(REVEAL_SETTLED, part));
      }
    });

    it('rests every part AT its own place, ready for the composed still', () => {
      for (const part of PARTS) {
        const p = partAt(REVEAL_SETTLED, part);
        expect(p.x).toBe(0);
        expect(p.y).toBe(0);
      }
    });

    it('REVEAL_REST is the settle now — the parts are the only movers left', () => {
      expect(REVEAL_REST).toBe(REVEAL_SETTLED);
    });
  });
});

describe('the one surviving fact', () => {
  it('the copy still claims about fifteen minutes', () => {
    expect(COUNT_TO).toBe(15);
  });
});
