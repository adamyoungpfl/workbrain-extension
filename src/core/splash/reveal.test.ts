import { describe, expect, it } from 'vitest';
import {
  COUNT_FROM,
  COUNT_TO,
  PRIVACY_LINES,
  REVEAL_SETTLED,
  ROLODEX_TURNS,
  countAt,
  linkAt,
  partAt,
  partStartsAt,
  privacyLineAt,
  rolodexAt,
} from './reveal';
import type { RevealPart } from './reveal';

const PARTS: RevealPart[] = ['lockup', 'tagline', 'time', 'privacy', 'doors'];

describe('partAt — the storyboard', () => {
  it('arrives in the order Adam described', () => {
    // lockup, then tagline under it, then the time section, then privacy.
    const order = [...PARTS].sort((a, b) => partStartsAt(a) - partStartsAt(b));
    expect(order.slice(0, 3)).toEqual(['lockup', 'tagline', 'time']);
    expect(partStartsAt('privacy')).toBeGreaterThan(partStartsAt('time'));
  });

  it('starts with nothing on screen', () => {
    for (const part of PARTS) expect(partAt(0, part).opacity).toBe(0);
  });

  it('opens on the lockup alone, in the middle', () => {
    const at = 0.75;
    expect(partAt(at, 'lockup')).toMatchObject({ opacity: 1, x: 0, y: 0 });
    expect(partAt(at, 'tagline').opacity).toBe(0);
    expect(partAt(at, 'time').opacity).toBe(0);
  });

  it('has the lockup RISING while the tagline is still arriving', () => {
    // The two read as one object gaining a line, not as two arrivals — which
    // only works if they overlap.
    const at = 1.3;
    const tagline = partAt(at, 'tagline');
    expect(tagline.opacity).toBeGreaterThan(0);
    expect(tagline.opacity).toBeLessThan(1);
    expect(partAt(at, 'lockup').y).toBeLessThan(0);
  });

  it('moves the lockup and tagline up again as the time section lands', () => {
    const before = partAt(2.0, 'lockup').y;
    const after = partAt(2.5, 'lockup').y;
    expect(after).toBeLessThan(before);
    expect(partAt(2.5, 'tagline').y).toBeLessThan(0);
  });

  it('moves the time section up AND slightly left, which the link must follow', () => {
    const settled = partAt(2.8, 'time');
    const moved = partAt(REVEAL_SETTLED, 'time');
    expect(moved.y).toBeLessThan(settled.y);
    expect(moved.x).toBeLessThan(0);
  });

  it('never moves anything sideways except the time section', () => {
    for (const part of PARTS) {
      if (part === 'time') continue;
      for (let t = 0; t <= 6; t += 0.1) expect(partAt(t, part).x).toBe(0);
    }
  });

  describe('it comes to rest, and stays', () => {
    it('has every part fully present and still by REVEAL_SETTLED', () => {
      // A reveal still moving while somebody is deciding competes with its own
      // buttons.
      for (const part of PARTS) {
        expect(partAt(REVEAL_SETTLED, part).opacity).toBe(1);
      }
    });

    it('is byte-identical at the settle and long after — nothing drifts', () => {
      for (const part of PARTS) {
        expect(partAt(REVEAL_SETTLED + 30, part)).toEqual(partAt(REVEAL_SETTLED, part));
      }
    });

    it('is what the still version renders', () => {
      // Reduced motion hands this the settled time and paints the result, so
      // the still frame is free rather than a second layout.
      const still = PARTS.map((p) => partAt(REVEAL_SETTLED, p));
      expect(still.every((s) => s.opacity === 1)).toBe(true);
    });
  });

  it('never overshoots opacity, at any instant', () => {
    for (const part of PARTS) {
      for (let t = -1; t <= 8; t += 0.02) {
        const o = partAt(t, part).opacity;
        expect(o).toBeGreaterThanOrEqual(0);
        expect(o).toBeLessThanOrEqual(1);
      }
    }
  });

  it('puts the doors up while the sections are still living underneath', () => {
    /* The judgement recorded in the module: Adam's order, taken strictly, puts
       the buttons after the second section finishes cycling — twelve to
       fifteen seconds before anything is pressable. The cinema plays; nobody
       is trapped in it. */
    expect(partStartsAt('doors')).toBeLessThan(6);
    expect(partAt(REVEAL_SETTLED, 'doors').opacity).toBe(1);
  });
});

describe('countAt — 30 streams down to 15', () => {
  it('holds at 30 until the section has arrived', () => {
    // Something the person watches happen, not something already over by the
    // time they look at it.
    expect(countAt(0)).toBe(COUNT_FROM);
    expect(countAt(partStartsAt('time'))).toBe(COUNT_FROM);
  });

  it('lands exactly on 15 and stops dead', () => {
    // A counter that decelerates forever reads as broken.
    expect(countAt(4)).toBe(COUNT_TO);
    expect(countAt(30)).toBe(COUNT_TO);
  });

  it('only ever counts down, and never past either end', () => {
    let previous = COUNT_FROM + 1;
    for (let t = 0; t <= 6; t += 0.02) {
      const n = countAt(t);
      expect(n).toBeLessThanOrEqual(previous);
      expect(n).toBeGreaterThanOrEqual(COUNT_TO);
      expect(n).toBeLessThanOrEqual(COUNT_FROM);
      previous = n;
    }
  });

  it('passes through the middle rather than jumping', () => {
    const seen = new Set<number>();
    for (let t = 2.5; t <= 4; t += 0.01) seen.add(countAt(t));
    expect(seen.size).toBeGreaterThan(6);
  });
});

describe('rolodexAt — it turns, then rests', () => {
  it('is still until the section is there to turn', () => {
    expect(rolodexAt(0).turning).toBe(false);
  });

  it('turns, and its progress runs 0 to 1 within a turn', () => {
    let sawTurning = false;
    for (let t = 3; t < 5; t += 0.02) {
      const r = rolodexAt(t);
      if (r.turning) {
        sawTurning = true;
        expect(r.progress).toBeGreaterThanOrEqual(0);
        expect(r.progress).toBeLessThanOrEqual(1);
      }
    }
    expect(sawTurning).toBe(true);
  });

  it('STOPS after three turns rather than looping forever', () => {
    /* A deliberate departure from "shows the same thing on a loop": a
       permanent animation on a screen asking somebody to choose keeps pulling
       the eye back to a line that has already said everything it has to say. */
    expect(rolodexAt(60).turning).toBe(false);
    expect(rolodexAt(60).turn).toBe(ROLODEX_TURNS - 1);
  });

  it('gets through exactly three turns, not two and not four', () => {
    const turns = new Set<number>();
    for (let t = 3; t < 12; t += 0.01) {
      const r = rolodexAt(t);
      if (r.turning) turns.add(r.turn);
    }
    expect(turns.size).toBe(ROLODEX_TURNS);
  });
});

describe('privacyLineAt — two claims, one slot', () => {
  it('shows nothing before the section arrives', () => {
    expect(privacyLineAt(0).opacity).toBe(0);
  });

  it('alternates rather than ending on an empty slot', () => {
    // An empty slot between them would read as a section that had finished
    // and left.
    const seen = new Set<number>();
    for (let t = 4.5; t < 20; t += 0.05) {
      const l = privacyLineAt(t);
      if (l.opacity > 0.9) seen.add(l.index);
    }
    expect(seen.size).toBe(PRIVACY_LINES);
  });

  it('never shows two at once — one index at any instant', () => {
    for (let t = 4.5; t < 20; t += 0.02) {
      const l = privacyLineAt(t);
      expect(l.index).toBeGreaterThanOrEqual(0);
      expect(l.index).toBeLessThan(PRIVACY_LINES);
      expect(l.opacity).toBeGreaterThanOrEqual(0);
      expect(l.opacity).toBeLessThanOrEqual(1);
    }
  });

  it('fully reaches each line rather than cross-fading through the middle', () => {
    let sawFull = false;
    for (let t = 4.5; t < 8; t += 0.02) if (privacyLineAt(t).opacity === 1) sawFull = true;
    expect(sawFull).toBe(true);
  });
});

describe('linkAt — the path leads INTO what is arriving', () => {
  it('is idle before there is anything to point at', () => {
    expect(linkAt(0, 'time').idle).toBe(true);
  });

  it('starts drawing BEFORE its destination lands', () => {
    // The eye is led into something arriving, rather than shown a line to
    // something already there — the whole reason a connector beats a gap.
    const arrives = partStartsAt('time');
    expect(linkAt(arrives - 0.2, 'time').idle).toBe(false);
  });

  it('finishes drawn, and stays drawn', () => {
    expect(linkAt(10, 'time')).toMatchObject({ drawn: 1, head: 1, idle: false });
  });

  it('never reports more than a whole path', () => {
    for (let t = 0; t <= 8; t += 0.02) {
      for (const part of ['time', 'privacy'] as RevealPart[]) {
        const l = linkAt(t, part);
        expect(l.drawn).toBeLessThanOrEqual(1);
        expect(l.head).toBeLessThanOrEqual(1);
      }
    }
  });
});
