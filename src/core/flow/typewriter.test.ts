import { describe, expect, it } from 'vitest';
import {
  BLINK_MS,
  HOLD_MS,
  MAX_LINES,
  OPACITY_BY_AGE,
  TYPE_MS,
  cycleMs,
  linesAt,
  loopMs,
} from './typewriter';

/* Short stand-ins rather than the real BASELINE_SEEDS: the timings under test
   are arithmetic over length, and a 50-character sentence in every expectation
   would hide that arithmetic behind the prose. */
const SEEDS = ['Draft', 'Plan', 'Sort', 'Find', 'Trim'] as const;
const DRAFT = cycleMs('Draft');

describe('linesAt — the seed stack', () => {
  describe('the newest line, being written', () => {
    it('paints the first letter immediately, not after one interval', () => {
      // A box that sits empty for 30ms before anything happens reads as broken.
      expect(linesAt(0, SEEDS)[0]?.text).toBe('D');
    });

    it('adds one letter per TYPE_MS', () => {
      expect(linesAt(TYPE_MS * 1 + 1, SEEDS)[0]?.text).toBe('Dr');
      expect(linesAt(TYPE_MS * 4 + 1, SEEDS)[0]?.text).toBe('Draft');
    });

    it('never paints past the end, and holds the whole line', () => {
      expect(linesAt(5 * TYPE_MS - 1, SEEDS)[0]).toMatchObject({
        text: 'Draft',
        phase: 'typing',
      });
      expect(linesAt(5 * TYPE_MS + 1, SEEDS)[0]).toMatchObject({
        text: 'Draft',
        phase: 'holding',
      });
    });

    it('is always at the top of the stack, at full strength', () => {
      const [newest] = linesAt(DRAFT + TYPE_MS, SEEDS);
      // One TYPE_MS in shows TWO characters: the first lands at t=0.
      expect(newest).toMatchObject({ age: 0, opacity: 1, index: 1, text: 'Pl' });
    });
  });

  describe('the stack builds, then descends', () => {
    it('opens with one line — no history nobody was shown', () => {
      // On the first pass the wrap would show the LAST examples as though
      // they had already gone by. They have not.
      expect(linesAt(0, SEEDS)).toHaveLength(1);
      expect(linesAt(TYPE_MS * 3, SEEDS)).toHaveLength(1);
    });

    it('adds a line each time an example completes', () => {
      expect(linesAt(DRAFT + 1, SEEDS)).toHaveLength(2);
      expect(linesAt(DRAFT + cycleMs('Plan') + 1, SEEDS)).toHaveLength(3);
    });

    it('never grows past the ladder', () => {
      const deep = loopMs(SEEDS) * 3 + DRAFT + 1;
      expect(linesAt(deep, SEEDS).length).toBe(MAX_LINES);
    });

    it('puts the previous example directly under the new one, dimmer', () => {
      const [newest, previous] = linesAt(DRAFT + TYPE_MS, SEEDS);
      expect(newest?.seed).toBe('Plan');
      expect(previous).toMatchObject({ seed: 'Draft', age: 1, text: 'Draft' });
      expect(previous?.opacity).toBe(OPACITY_BY_AGE[1]);
    });

    it('dims one rung per line, all the way down', () => {
      const stack = linesAt(loopMs(SEEDS) + DRAFT + 1, SEEDS);
      expect(stack.map((l) => l.opacity)).toEqual([...OPACITY_BY_AGE]);
      // Monotonically fainter — the ladder is what says "this one is leaving".
      for (let i = 1; i < stack.length; i += 1) {
        expect(stack[i]!.opacity).toBeLessThan(stack[i - 1]!.opacity);
      }
      expect(stack[stack.length - 1]!.opacity).toBeLessThan(0.1);
    });

    it('wraps to real history once the list has come round', () => {
      // Second pass, first example: the lines below it are the END of the
      // list, which is exactly what the person just watched.
      const stack = linesAt(loopMs(SEEDS) + 1, SEEDS);
      expect(stack.map((l) => l.seed)).toEqual(['Draft', 'Trim', 'Find', 'Sort']);
    });

    it('only the newest line is ever partial; the rest are whole', () => {
      const stack = linesAt(loopMs(SEEDS) + DRAFT + TYPE_MS * 2, SEEDS);
      expect(stack[0]?.text).toBe('Pla');
      expect(stack.slice(1).every((l) => l.text === l.seed)).toBe(true);
    });
  });

  describe('what a click gets', () => {
    it('offers EVERY visible line, not just the one being written', () => {
      // The point of keeping them: somebody who recognises the example from
      // two lines ago should not wait a whole loop for it to come back.
      const stack = linesAt(loopMs(SEEDS) + DRAFT + 1, SEEDS);
      expect(stack.length).toBeGreaterThan(1);
      expect(stack.every((l) => l.takeable)).toBe(true);
    });

    it('yields the WHOLE line mid-type, never the fragment on screen', () => {
      // Somebody clicking "Dra" means Draft. Committing a fragment into a box
      // that gets sent verbatim would read as a bug.
      const [newest] = linesAt(TYPE_MS * 2 + 1, SEEDS);
      expect(newest?.text).toBe('Dra');
      expect(newest?.seed).toBe('Draft');
    });
  });

  describe('the caret', () => {
    it('is solid while writing — a blink there reads as a fault', () => {
      expect(linesAt(TYPE_MS * 2 + 1, SEEDS)[0]?.caret).toBe(true);
    });

    it('blinks during the hold, and gets through a few flashes', () => {
      const typed = 5 * TYPE_MS;
      expect(linesAt(typed + 1, SEEDS)[0]?.caret).toBe(true);
      expect(linesAt(typed + BLINK_MS + 1, SEEDS)[0]?.caret).toBe(false);
      expect(Math.floor(HOLD_MS / BLINK_MS)).toBeGreaterThanOrEqual(4);
    });

    it('is never on a line that has descended', () => {
      // Two carets would be two claims about where the writing is happening.
      const stack = linesAt(loopMs(SEEDS) + DRAFT + 1, SEEDS);
      expect(stack.slice(1).some((l) => l.caret)).toBe(false);
    });
  });

  describe('degrades rather than throws', () => {
    it('returns an empty stack for an empty list', () => {
      expect(linesAt(1234, [])).toEqual([]);
    });

    it('shows the first frame for a clock that has not started', () => {
      expect(linesAt(-500, SEEDS)[0]?.text).toBe('D');
    });

    it('handles a one-example list without a phantom stack', () => {
      const solo = linesAt(cycleMs('Draft') * 2 + 1, ['Draft']);
      expect(solo.every((l) => l.seed === 'Draft')).toBe(true);
    });
  });

  it('holds a real seed long enough to be read before the next arrives', () => {
    // The recognition test Adam set — "not need to think about it twice" —
    // only works if the line is whole and still for long enough to take in.
    const real = 'Draft my weekly status update for my manager';
    expect(HOLD_MS).toBeGreaterThanOrEqual(2000);
    expect(real.length * TYPE_MS).toBeLessThan(2000);
  });
});
