import { describe, expect, it } from 'vitest';
import {
  BLINK_MS,
  FADE_MS,
  GAP_MS,
  HOLD_MS,
  TYPE_MS,
  cycleMs,
  frameAt,
  loopMs,
} from './typewriter';

/* Two short stand-ins rather than the real BASELINE_SEEDS: the timings under
   test are arithmetic over length, and a 55-character sentence in every
   expectation would hide that arithmetic behind the prose. */
const WORDS = ['Draft', 'Plan'] as const;

describe('frameAt — the seed example typing itself', () => {
  it('paints the first letter immediately, not after one interval', () => {
    // A box that sits empty for 78ms before anything happens reads as broken.
    expect(frameAt(0, WORDS).text).toBe('D');
  });

  it('adds one letter per TYPE_MS', () => {
    expect(frameAt(TYPE_MS * 0 + 1, WORDS).text).toBe('D');
    expect(frameAt(TYPE_MS * 1 + 1, WORDS).text).toBe('Dr');
    expect(frameAt(TYPE_MS * 2 + 1, WORDS).text).toBe('Dra');
    expect(frameAt(TYPE_MS * 4 + 1, WORDS).text).toBe('Draft');
  });

  it('never paints past the end of the word', () => {
    const atEnd = frameAt(TYPE_MS * 5 - 1, WORDS);
    expect(atEnd.text).toBe('Draft');
    expect(atEnd.phase).toBe('typing');
  });

  it('holds the whole word for HOLD_MS', () => {
    const typed = 5 * TYPE_MS;
    expect(frameAt(typed + 1, WORDS)).toMatchObject({ text: 'Draft', phase: 'holding' });
    expect(frameAt(typed + HOLD_MS - 1, WORDS)).toMatchObject({
      text: 'Draft',
      phase: 'holding',
    });
  });

  describe('the exit is a fade, not a backspace', () => {
    const held = 5 * TYPE_MS + HOLD_MS;

    it('keeps the WHOLE line on screen and walks its opacity down', () => {
      // A sentence cannot erase itself letter by letter: fast enough not to
      // be tedious reads as a glitch, slow enough to read takes longer to
      // leave than it took to arrive.
      expect(frameAt(held + 1, WORDS)).toMatchObject({ text: 'Draft', phase: 'fading' });
      expect(frameAt(held + FADE_MS / 2, WORDS).opacity).toBeCloseTo(0.5, 1);
      expect(frameAt(held + FADE_MS - 1, WORDS).opacity).toBeLessThan(0.01);
    });

    it('is fully opaque everywhere else', () => {
      expect(frameAt(TYPE_MS * 2, WORDS).opacity).toBe(1);
      expect(frameAt(held - 1, WORDS).opacity).toBe(1);
      expect(frameAt(held + FADE_MS + 1, WORDS).opacity).toBe(1);
    });

    it('drops the caret while the line is going', () => {
      // A blinking cursor on a line that is disappearing is two cues
      // disagreeing about whether anything is still being written.
      expect(frameAt(held + 1, WORDS).caret).toBe(false);
    });
  });

  it('goes dark for the gap, then starts the next example', () => {
    const faded = 5 * TYPE_MS + HOLD_MS + FADE_MS;
    expect(frameAt(faded + 1, WORDS)).toMatchObject({ text: '', phase: 'gap' });
    expect(frameAt(cycleMs('Draft') + 1, WORDS)).toMatchObject({
      text: 'P',
      index: 1,
      phase: 'typing',
    });
  });

  it('loops back to the first example forever', () => {
    const loop = loopMs(WORDS);
    expect(loop).toBe(cycleMs('Draft') + cycleMs('Plan'));
    expect(frameAt(loop, WORDS).text).toBe('D');
    expect(frameAt(loop * 7 + TYPE_MS + 1, WORDS)).toMatchObject({ text: 'Dr', index: 0 });
  });

  describe('the caret', () => {
    it('is solid while writing — a blink there reads as a fault', () => {
      expect(frameAt(TYPE_MS * 2 + 1, WORDS).caret).toBe(true);
    });

    it('blinks during the hold, and gets through a few flashes', () => {
      const typed = 5 * TYPE_MS;
      expect(frameAt(typed + 1, WORDS).caret).toBe(true);
      expect(frameAt(typed + BLINK_MS + 1, WORDS).caret).toBe(false);
      expect(frameAt(typed + BLINK_MS * 2 + 1, WORDS).caret).toBe(true);
      expect(Math.floor(HOLD_MS / BLINK_MS)).toBeGreaterThanOrEqual(4);
    });

    it('stays lit through the gap so the box never looks switched off', () => {
      expect(frameAt(cycleMs('Draft') - 1, WORDS).caret).toBe(true);
    });
  });

  describe('what a click gets — Adam\'s "from the first letter until it disappears"', () => {
    it('is takeable from the very first painted letter', () => {
      expect(frameAt(0, WORDS).takeable).toBe(true);
    });

    it('stays takeable through the whole hold', () => {
      expect(frameAt(5 * TYPE_MS + HOLD_MS / 2, WORDS).takeable).toBe(true);
    });

    it('stays takeable all the way down the fade, and not into the gap', () => {
      // A line at 20% opacity is still a line somebody can see and mean to
      // click. A gap is not.
      const held = 5 * TYPE_MS + HOLD_MS;
      expect(frameAt(held + FADE_MS - 1, WORDS).takeable).toBe(true);
      expect(frameAt(held + FADE_MS + 1, WORDS)).toMatchObject({
        text: '',
        takeable: false,
      });
    });

    it('yields the WHOLE line mid-type, never the fragment on screen', () => {
      // Somebody clicking "Dra" means Draft. Committing a fragment into a box
      // that gets sent verbatim would read as a bug.
      const mid = frameAt(TYPE_MS * 2 + 1, WORDS);
      expect(mid.text).toBe('Dra');
      expect(mid.seed).toBe('Draft');
    });
  });

  describe('degrades rather than throws', () => {
    it('returns a still empty frame for an empty list', () => {
      expect(frameAt(1234, [])).toMatchObject({ text: '', takeable: false });
    });

    it('shows the first frame for a clock that has not started', () => {
      expect(frameAt(-500, WORDS).text).toBe('D');
    });

    it('handles a one-word list without a division by anything', () => {
      expect(frameAt(cycleMs('Draft') + 1, ['Draft']).text).toBe('D');
    });
  });

  it('gives every example the same shape of cycle', () => {
    expect(cycleMs('Plan')).toBe(4 * TYPE_MS + HOLD_MS + FADE_MS + GAP_MS);
  });

  it('holds a real seed long enough to be read before it goes', () => {
    // The recognition test Adam set — "not need to think about it twice" —
    // only works if the line is whole and still for long enough to take in.
    const real = 'Turn these notes into a 3-bullet update: win, risk, next';
    expect(HOLD_MS).toBeGreaterThanOrEqual(2000);
    expect(real.length * TYPE_MS).toBeLessThan(2000);
  });
});
