import { describe, expect, it } from 'vitest';
import {
  CLAIM_ANGLE,
  CLAIM_LANDS,
  CLAIM_TRUE,
  CLAIM_WORDS,
  COUNT_FROM,
  COUNT_TO,
  REVEAL_REST,
  REVEAL_SETTLED,
  ROLODEX_TURNS,
  claimWordAt,
  countAt,
  linkAt,
  partAt,
  partStartsAt,
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

  it('leans the two sections OPPOSITE ways, and moves nothing else sideways', () => {
    /* SUPERSEDED 2026-09-01 (slice 3b, Adam: "the same treatment as the About
       15 minutes but offset just slightly to the right"). This used to say
       nothing moved sideways except the time section. The second section now
       answers the first's lean, and the two offsets are what the connector
       between them bends around — a path down a straight line is a rule, and
       a path that leans is a route.

       The lockup and the tagline still never move sideways: they are the axis
       everything else is arranged around, and an axis that drifts is not one. */
    expect(partAt(REVEAL_SETTLED, 'time').x).toBeLessThan(0);
    expect(partAt(REVEAL_SETTLED, 'privacy').x).toBeGreaterThan(0);
    for (const part of ['lockup', 'tagline', 'doors'] as RevealPart[]) {
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

describe('claimWordAt — the true claim is arrived at, not asserted', () => {
  it('shows nothing before the section is there to hold it', () => {
    expect(claimWordAt(0).opacity).toBe(0);
    expect(claimWordAt(0).strike).toBe(0);
  });

  it('gets through every phrase, in order, and never goes back', () => {
    const seen = new Set<number>();
    let last = 0;
    for (let t = 4.6; t < 20; t += 0.01) {
      const { index } = claimWordAt(t);
      expect(index).toBeGreaterThanOrEqual(last);
      last = index;
      seen.add(index);
    }
    expect(seen.size).toBe(CLAIM_WORDS);
    expect(last).toBe(CLAIM_TRUE);
  });

  it('strikes every wrong answer through, fully', () => {
    const struck = new Set<number>();
    for (let t = 4.6; t < 20; t += 0.005) {
      const w = claimWordAt(t);
      if (w.strike === 1) struck.add(w.index);
    }
    // Every wrong one, and only the wrong ones.
    expect([...struck].sort()).toEqual([0, 1, 2]);
  });

  it('NEVER strikes the true one — it is what is left standing', () => {
    for (let t = 4.6; t < 60; t += 0.005) {
      const w = claimWordAt(t);
      if (w.index === CLAIM_TRUE) expect(w.strike).toBe(0);
    }
  });

  it('comes to rest face-on, underlined, and stays there', () => {
    // Continuously across the first seconds past the landing, not only at a
    // few far-apart points: a device that twitched once a second after it
    // settled would pass a sample at 60s and be wrong on screen.
    for (let t = CLAIM_LANDS; t < CLAIM_LANDS + 6; t += 0.01) {
      expect(claimWordAt(t).resting).toBe(true);
      expect(claimWordAt(t).rotate).toBe(0);
    }
    for (const t of [CLAIM_LANDS, CLAIM_LANDS + 1, 60, 600]) {
      expect(claimWordAt(t)).toEqual({
        index: CLAIM_TRUE,
        rotate: 0,
        opacity: 1,
        strike: 0,
        underline: 1,
        resting: true,
      });
    }
  });

  it('UNDERLINES the true one and strikes nothing else — the same mark, moved', () => {
    /* Adam: "make the last strike be an underline for the word Nothing".
       Three answers get a line through them and the fourth gets a line under
       it. What must never happen is both on one phrase, or an underline on an
       answer that is about to be thrown away. */
    let sawDrawing = false;
    for (let t = 4.6; t < 20; t += 0.005) {
      const w = claimWordAt(t);
      if (w.underline > 0) {
        expect(w.index).toBe(CLAIM_TRUE);
        expect(w.strike).toBe(0);
        if (w.underline < 1) sawDrawing = true;
      }
      if (w.strike > 0) expect(w.index).not.toBe(CLAIM_TRUE);
    }
    // Drawn, not switched on: the line arrives across the word.
    expect(sawDrawing).toBe(true);
  });

  it('waits a beat before underlining — the answer is what is LEFT', () => {
    /* Underlining the word the instant it lands reads as one movement. The
       point of the device is that three others had to go first. */
    const landed = CLAIM_LANDS - 0.5;
    expect(claimWordAt(landed).index).toBe(CLAIM_TRUE);
    expect(claimWordAt(landed).rotate).toBe(0);
    let firstMark = 0;
    for (let t = 4.6; t < 20; t += 0.005) {
      if (claimWordAt(t).underline > 0) {
        firstMark = t;
        break;
      }
    }
    let faceOn = 0;
    for (let t = 4.6; t < 20; t += 0.005) {
      const w = claimWordAt(t);
      if (w.index === CLAIM_TRUE && w.rotate === 0) {
        faceOn = t;
        break;
      }
    }
    expect(firstMark - faceOn).toBeGreaterThan(0.2);
  });

  it('is invisible whenever it is edge-on, and solid whenever it is face-on', () => {
    /* Opacity is a function of the rotation rather than a second curve beside
       it. A card that is half-lit while face-on, or solid while edge-on, reads
       as a bug rather than as a card. */
    for (let t = 4.6; t < 12; t += 0.005) {
      const w = claimWordAt(t);
      if (Math.abs(w.rotate) < 0.01) expect(w.opacity).toBeCloseTo(1, 5);
      if (Math.abs(w.rotate) > CLAIM_ANGLE - 0.01) expect(w.opacity).toBeCloseTo(0, 5);
    }
  });

  it('hands over at the edge — no phrase is ever readable while another leaves', () => {
    /* The swap is the one frame that could give the trick away: two phrases
       are never on screen together, so the outgoing one must be gone before
       the incoming one is anything. Both are the same element, so what this
       actually asserts is that the index only changes while nothing is
       visible. */
    let previous = claimWordAt(4.6);
    for (let t = 4.6; t < 12; t += 0.002) {
      const w = claimWordAt(t);
      if (w.index !== previous.index) {
        expect(previous.opacity).toBeLessThan(0.02);
        expect(w.opacity).toBeLessThan(0.02);
      }
      previous = w;
    }
  });

  it('never reports a strike outside 0 to 1, or a tip past the angle', () => {
    for (let t = 0; t < 20; t += 0.005) {
      const w = claimWordAt(t);
      expect(w.strike).toBeGreaterThanOrEqual(0);
      expect(w.strike).toBeLessThanOrEqual(1);
      expect(w.opacity).toBeGreaterThanOrEqual(0);
      expect(w.opacity).toBeLessThanOrEqual(1);
      expect(Math.abs(w.rotate)).toBeLessThanOrEqual(CLAIM_ANGLE);
    }
  });

  it('carries its correction away with it — a struck phrase leaves struck', () => {
    // Adam: "the crossed out word flips over to the back as the new word
    // flips in." The line does not clear before the exit; that would read as
    // the answer being un-rejected.
    let sawLeavingStruck = false;
    for (let t = 4.6; t < 12; t += 0.005) {
      const w = claimWordAt(t);
      if (w.index !== CLAIM_TRUE && w.rotate < -1) {
        expect(w.strike).toBe(1);
        sawLeavingStruck = true;
      }
    }
    expect(sawLeavingStruck).toBe(true);
  });
});

describe('REVEAL_REST — the moment the screen stops moving', () => {
  it('is after the parts have settled: the sections live on a while', () => {
    // Distinct claims. The PARTS stop moving at REVEAL_SETTLED, which is what
    // the still frame renders; the sections inside them keep going.
    expect(REVEAL_REST).toBeGreaterThan(REVEAL_SETTLED);
  });

  it('nothing turns, fades or moves after it — ever', () => {
    const after = REVEAL_REST + 0.01;
    // Swept, not sampled: one instant proves one instant. The rolodex rests
    // between turns, so a single check after the end cannot tell a device
    // that has stopped from one that is merely between beats.
    for (let t = after; t < after + 12; t += 0.01) expect(rolodexAt(t).turning).toBe(false);
    for (const t of [after, after + 5, after + 300]) {
      expect(claimWordAt(t)).toEqual(claimWordAt(after));
      for (const part of PARTS) expect(partAt(t, part)).toEqual(partAt(after, part));
    }
  });

  it('is late enough to cover the last turn AND the last claim', () => {
    /* Whichever device ends last sets it, so re-timing either keeps it true
       rather than leaving a constant behind that used to be right.

       Motion means EVERY kind on this screen, not just fades: a turning card,
       a tipping phrase, a line being drawn, and any part still travelling.
       Scanning opacity alone would have missed the rotation entirely and
       called a moving screen still. */
    let lastMotion = 0;
    const moving = (t: number): boolean => {
      if (rolodexAt(t).turning) return true;
      const w = claimWordAt(t);
      if (!w.resting) return true;
      const next = claimWordAt(t + 0.01);
      if (w.rotate !== next.rotate || w.strike !== next.strike) return true;
      return PARTS.some((p) => {
        const a = partAt(t, p);
        const b = partAt(t + 0.01, p);
        return a.x !== b.x || a.y !== b.y || a.opacity !== b.opacity;
      });
    };
    for (let t = 0; t < 30; t += 0.01) if (moving(t)) lastMotion = t;
    expect(lastMotion).toBeLessThanOrEqual(REVEAL_REST + 0.02);
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
