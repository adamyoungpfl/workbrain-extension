import { describe, it, expect } from 'vitest';
import {
  ROTATE_MS,
  clampIndex,
  isRunning,
  nextIndex,
  offersStop,
  rotates,
  viewFor,
  type RotationHold,
  type RotationInput,
} from './rotation';

function input(over: Partial<RotationInput> = {}): RotationInput {
  return { count: 3, mode: 'one', reduced: false, holds: [], ...over };
}

describe('rotation', () => {
  it('rotates on the five seconds VB-42 asks for by name', () => {
    expect(ROTATE_MS).toBe(5000);
  });

  describe('the index', () => {
    it('wraps at the end, so the list keeps renewing', () => {
      expect(nextIndex(0, 3)).toBe(1);
      expect(nextIndex(1, 3)).toBe(2);
      expect(nextIndex(2, 3)).toBe(0);
    });

    it('survives a count that changed underneath it', () => {
      expect(clampIndex(5, 2)).toBe(1);
      expect(clampIndex(2, 2)).toBe(0);
      expect(clampIndex(-1, 3)).toBe(2);
      expect(clampIndex(3, 0)).toBe(0);
      expect(nextIndex(0, 0)).toBe(0);
    });
  });

  describe('what is on screen', () => {
    it('shows one link at the current index while it rotates', () => {
      expect(viewFor(input(), 1)).toEqual({ kind: 'one', index: 1 });
    });

    it('shows the static list when the person pressed the stop', () => {
      expect(viewFor(input({ mode: 'all' }), 1)).toEqual({ kind: 'all' });
    });

    it('shows the static list under reduced motion, whatever the surface asked', () => {
      expect(viewFor(input({ reduced: true }), 1)).toEqual({ kind: 'all' });
    });

    it('shows the list when there is only one follow-up — nothing to rotate to', () => {
      expect(viewFor(input({ count: 1 }), 0)).toEqual({ kind: 'all' });
      expect(viewFor(input({ count: 0 }), 0)).toEqual({ kind: 'all' });
    });

    it('keeps showing the held link rather than falling back to the list', () => {
      // A hold stops the clock. It does not change the presentation, or
      // hovering a link would replace it with a list under the pointer.
      expect(viewFor(input({ holds: ['hover'] }), 2)).toEqual({ kind: 'one', index: 2 });
    });
  });

  describe('the clock', () => {
    it('runs when a question rotates and nothing is holding it', () => {
      expect(isRunning(input())).toBe(true);
    });

    const everyHold: RotationHold[] = ['hover', 'focus', 'answering', 'open'];
    for (const hold of everyHold) {
      it(`stops on ${hold}`, () => {
        expect(isRunning(input({ holds: [hold] }))).toBe(false);
        // ...and starts again when the reason goes away.
        expect(isRunning(input({ holds: [] }))).toBe(true);
      });
    }

    it('never runs for the static list, the single follow-up, or reduced motion', () => {
      expect(isRunning(input({ mode: 'all' }))).toBe(false);
      expect(isRunning(input({ count: 1 }))).toBe(false);
      expect(isRunning(input({ reduced: true }))).toBe(false);
    });
  });

  describe('the visible stop — WCAG 2.2.2', () => {
    it('is offered wherever the motion is possible, held or not', () => {
      expect(offersStop(input())).toBe(true);
      expect(offersStop(input({ holds: ['hover', 'focus'] }))).toBe(true);
    });

    it('is not offered where nothing can move', () => {
      expect(offersStop(input({ count: 1 }))).toBe(false);
      expect(offersStop(input({ reduced: true }))).toBe(false);
      expect(offersStop(input({ mode: 'all' }))).toBe(false);
    });

    it('agrees with `rotates`, which is the one condition all three read', () => {
      for (const count of [0, 1, 2, 3]) {
        for (const mode of ['one', 'all'] as const) {
          for (const reduced of [false, true]) {
            const i = input({ count, mode, reduced });
            expect(offersStop(i)).toBe(rotates(i));
            expect(viewFor(i, 0).kind).toBe(rotates(i) ? 'one' : 'all');
          }
        }
      }
    });
  });
});
