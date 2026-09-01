import { describe, expect, it } from 'vitest';
import {
  BLINK_MS,
  ERASE_MS,
  GAP_MS,
  HOLD_MS,
  TYPE_MS,
  cycleMs,
  frameAt,
  loopMs,
} from './typewriter';

const WORDS = ['Draft', 'Plan'] as const;

describe('frameAt — the starter verb typing itself', () => {
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

  it('takes letters off during the erase, fastest last', () => {
    const held = 5 * TYPE_MS + HOLD_MS;
    expect(frameAt(held + 1, WORDS).text).toBe('Draf');
    expect(frameAt(held + ERASE_MS + 1, WORDS).text).toBe('Dra');
    expect(frameAt(held + ERASE_MS * 4 + 1, WORDS).text).toBe('');
  });

  it('goes dark for the gap, then starts the next word', () => {
    const erased = 5 * TYPE_MS + HOLD_MS + 5 * ERASE_MS;
    expect(frameAt(erased + 1, WORDS)).toMatchObject({ text: '', phase: 'gap' });
    expect(frameAt(cycleMs('Draft') + 1, WORDS)).toMatchObject({
      text: 'P',
      index: 1,
      phase: 'typing',
    });
  });

  it('loops back to the first word forever', () => {
    const loop = loopMs(WORDS);
    expect(loop).toBe(cycleMs('Draft') + cycleMs('Plan'));
    expect(frameAt(loop, WORDS).text).toBe('D');
    expect(frameAt(loop * 7 + TYPE_MS + 1, WORDS)).toMatchObject({ text: 'Dr', index: 0 });
  });

  describe('the caret', () => {
    it('is solid while writing and while erasing — a blink there reads as a fault', () => {
      expect(frameAt(TYPE_MS * 2 + 1, WORDS).caret).toBe(true);
      expect(frameAt(5 * TYPE_MS + HOLD_MS + ERASE_MS + 1, WORDS).caret).toBe(true);
    });

    it('blinks during the hold, and gets through a few flashes', () => {
      const typed = 5 * TYPE_MS;
      expect(frameAt(typed + 1, WORDS).caret).toBe(true);
      expect(frameAt(typed + BLINK_MS + 1, WORDS).caret).toBe(false);
      expect(frameAt(typed + BLINK_MS * 2 + 1, WORDS).caret).toBe(true);
      expect(Math.floor(HOLD_MS / BLINK_MS)).toBeGreaterThanOrEqual(3);
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

    it('stays takeable until the last letter is gone, and not after', () => {
      const held = 5 * TYPE_MS + HOLD_MS;
      expect(frameAt(held + ERASE_MS * 3 + 1, WORDS).takeable).toBe(true);
      expect(frameAt(held + ERASE_MS * 4 + 1, WORDS)).toMatchObject({
        text: '',
        takeable: false,
      });
    });

    it('yields the WHOLE word mid-type, never the fragment on screen', () => {
      // Somebody clicking "Dra" means Draft. Committing a fragment into a box
      // that gets sent verbatim would read as a bug.
      const mid = frameAt(TYPE_MS * 2 + 1, WORDS);
      expect(mid.text).toBe('Dra');
      expect(mid.word).toBe('Draft');
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

  it('gives every word the same shape of cycle', () => {
    expect(cycleMs('Plan')).toBe(4 * TYPE_MS + HOLD_MS + 4 * ERASE_MS + GAP_MS);
  });
});
