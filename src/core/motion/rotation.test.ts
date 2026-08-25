import { describe, it, expect } from 'vitest';
import * as rotation from './rotation';
import {
  ROTATE_MS,
  ROTATION_INTERACTIONS,
  ROTATION_RUNNING,
  clampIndex,
  hasStopped,
  isRunning,
  nextIndex,
  showsOneAtATime,
  stopRotation,
  stoppedBy,
  viewFor,
  type RotationHold,
  type RotationInput,
  type RotationLife,
} from './rotation';

function input(over: Partial<RotationInput> = {}): RotationInput {
  return { count: 3, mode: 'one', reduced: false, holds: [], life: ROTATION_RUNNING, ...over };
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

    it('shows the static list when the surface asks for the list', () => {
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

    it('FREEZES on the link that was showing when it stopped — it never spills the list', () => {
      // The whole reason `viewFor` is blind to `life`. A stop that grew the
      // block from one row to three would shove the answer field down on the
      // one gesture nobody can avoid making, which is not a stop.
      for (const by of ROTATION_INTERACTIONS) {
        const stopped = input({ life: stopRotation(ROTATION_RUNNING, by) });
        expect(viewFor(stopped, 2), `stopped by ${by}`).toEqual({ kind: 'one', index: 2 });
        expect(showsOneAtATime(stopped)).toBe(true);
      }
    });
  });

  describe('the clock', () => {
    it('runs when a question rotates and nothing is holding or has ended it', () => {
      expect(isRunning(input())).toBe(true);
    });

    const everyHold: RotationHold[] = ['hover'];
    for (const hold of everyHold) {
      it(`pauses on ${hold}, and starts again when the reason goes away`, () => {
        expect(isRunning(input({ holds: [hold] }))).toBe(false);
        expect(isRunning(input({ holds: [] }))).toBe(true);
      });
    }

    it('never runs for the static list, the single follow-up, or reduced motion', () => {
      expect(isRunning(input({ mode: 'all' }))).toBe(false);
      expect(isRunning(input({ count: 1 }))).toBe(false);
      expect(isRunning(input({ reduced: true }))).toBe(false);
    });
  });

  /**
   * V2.0 VB-57 / docs/V2.0-REFINEMENT.md FLAG 1. "Show all" was WCAG 2.2.2's
   * visible mechanism; what replaces it is that the rotation stops on any
   * interaction and never resumes. So this block is the thing that makes
   * deleting a control legitimate, and it is tested as such.
   */
  describe('the terminal stop — what replaces the visible control', () => {
    it('starts running', () => {
      expect(ROTATION_RUNNING.kind).toBe('running');
      expect(hasStopped(ROTATION_RUNNING)).toBe(false);
      expect(stoppedBy(ROTATION_RUNNING)).toBeNull();
    });

    for (const by of ROTATION_INTERACTIONS) {
      it(`stops for good on ${by}, on its own, with nothing else needed`, () => {
        const life = stopRotation(ROTATION_RUNNING, by);
        expect(hasStopped(life)).toBe(true);
        expect(stoppedBy(life)).toBe(by);
        // Independently: no other interaction, no hold, nothing else set.
        expect(isRunning(input({ life }))).toBe(false);
      });
    }

    it('covers every gesture FLAG 1 names, and nothing has been quietly dropped', () => {
      expect([...ROTATION_INTERACTIONS].sort()).toEqual(
        ['click', 'focus', 'key', 'open', 'rephrase', 'typing'],
      );
    });

    it('keeps the FIRST reason: what stopped it is what stopped it', () => {
      const life = stopRotation(stopRotation(ROTATION_RUNNING, 'focus'), 'click');
      expect(stoppedBy(life)).toBe('focus');
    });

    it('is the same value on a second stop, so nothing re-renders on the way past', () => {
      const once = stopRotation(ROTATION_RUNNING, 'click');
      expect(stopRotation(once, 'key')).toBe(once);
    });

    it('stays stopped through every interaction in every order', () => {
      for (const first of ROTATION_INTERACTIONS) {
        let life: RotationLife = stopRotation(ROTATION_RUNNING, first);
        for (const later of ROTATION_INTERACTIONS) {
          life = stopRotation(life, later);
          expect(hasStopped(life), `${first} then ${later}`).toBe(true);
          expect(stoppedBy(life)).toBe(first);
        }
      }
    });

    it('cannot be resumed — there is no transition back, which is the design', () => {
      // "Never resumes when focus leaves, when a follow-up closes, or on a
      // timer" is not a rule a caller has to remember. It is the absence of a
      // function. If one is ever added, this fails and the reasoning in the
      // header has to be re-argued rather than quietly lost.
      const exported = Object.keys(rotation);
      expect(exported.filter((name) => /resume|restart|reset|clearStop|unstop/i.test(name))).toEqual([]);

      // And no combination of the inputs a surface controls brings it back.
      const life = stopRotation(ROTATION_RUNNING, 'open');
      for (const holds of [[], ['hover'] as RotationHold[]]) {
        for (const mode of ['one', 'all'] as const) {
          for (const reduced of [false, true]) {
            for (const count of [0, 1, 2, 3]) {
              expect(isRunning(input({ life, holds, mode, reduced, count }))).toBe(false);
            }
          }
        }
      }
    });

    it('is the only thing that separates a stopped rotation from a running one on screen', () => {
      // Same presentation, same index, different clock — which is what
      // "the motion stops" has to mean for content that is still being read.
      const running = input();
      const stopped = input({ life: stopRotation(ROTATION_RUNNING, 'click') });
      expect(viewFor(stopped, 1)).toEqual(viewFor(running, 1));
      expect(isRunning(stopped)).toBe(false);
      expect(isRunning(running)).toBe(true);
    });

    it('offers no visible stop control: there is nothing left in this module that asks for one', () => {
      expect(Object.keys(rotation)).not.toContain('offersStop');
    });
  });

  describe('the presentation', () => {
    it('is the one condition the view and the clock both read', () => {
      for (const count of [0, 1, 2, 3]) {
        for (const mode of ['one', 'all'] as const) {
          for (const reduced of [false, true]) {
            const i = input({ count, mode, reduced });
            expect(viewFor(i, 0).kind).toBe(showsOneAtATime(i) ? 'one' : 'all');
            expect(isRunning(i)).toBe(showsOneAtATime(i));
          }
        }
      }
    });
  });
});
