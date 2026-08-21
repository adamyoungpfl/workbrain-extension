import { describe, it, expect } from 'vitest';
import {
  CLOSED,
  EXPAND_MS,
  activeIndex,
  isExpanded,
  isMoving,
  isRendered,
  roleOf,
  settle,
  showsAnswer,
  toggle,
  type ExpandPhase,
} from './disclosure';

/**
 * The rules VB-16 is judged against, stated as arithmetic rather than as a
 * browser: exactly one item owns the surface, the others are gone only after
 * their transition, `aria-expanded` follows the person's intent and not the
 * animation, and every path settles.
 */
describe('expand-in-place phases', () => {
  it('rests with every item in flow and nothing expanded', () => {
    expect(roleOf(CLOSED, 0)).toBe('rest');
    expect(roleOf(CLOSED, 7)).toBe('rest');
    expect(activeIndex(CLOSED)).toBeNull();
    expect(isMoving(CLOSED)).toBe(false);
  });

  it('opens through a transitional state where the siblings are still mounted', () => {
    const opening = toggle(CLOSED, 1, true);
    expect(opening).toEqual({ kind: 'opening', index: 1 });
    expect(roleOf(opening, 1)).toBe('expanded');
    expect(roleOf(opening, 0)).toBe('leaving');
    // Still rendered — a ghost is a thing you can see leaving.
    expect(isRendered(roleOf(opening, 0))).toBe(true);
    expect(isMoving(opening)).toBe(true);
  });

  it('unmounts the siblings only once the transition has finished', () => {
    const open = settle(toggle(CLOSED, 1, true));
    expect(open).toEqual({ kind: 'open', index: 1 });
    expect(roleOf(open, 0)).toBe('gone');
    expect(isRendered(roleOf(open, 0))).toBe(false);
    expect(roleOf(open, 1)).toBe('expanded');
    expect(isMoving(open)).toBe(false);
  });

  it('brings the siblings back before the closing transition, not after it', () => {
    const closing = toggle({ kind: 'open', index: 1 }, 1, true);
    expect(closing).toEqual({ kind: 'closing', index: 1 });
    // They have to be in the tree to be animated back in.
    expect(roleOf(closing, 0)).toBe('entering');
    expect(isRendered(roleOf(closing, 0))).toBe(true);
    expect(roleOf(closing, 1)).toBe('collapsing');
    expect(settle(closing)).toEqual(CLOSED);
  });

  it('keeps the answer on screen while it collapses, and hides it after', () => {
    const closing: ExpandPhase = { kind: 'closing', index: 0 };
    expect(showsAnswer(roleOf(closing, 0))).toBe(true);
    expect(showsAnswer(roleOf(settle(closing), 0))).toBe(false);
    expect(showsAnswer(roleOf({ kind: 'opening', index: 0 }, 0))).toBe(true);
    expect(showsAnswer(roleOf({ kind: 'open', index: 0 }, 0))).toBe(true);
    expect(showsAnswer('rest')).toBe(false);
    expect(showsAnswer('leaving')).toBe(false);
  });

  it('reports aria-expanded by intent, not by what is still on screen', () => {
    // Pressed to open: true from the first frame, before the answer arrives.
    expect(isExpanded({ kind: 'opening', index: 2 }, 2)).toBe(true);
    expect(isExpanded({ kind: 'open', index: 2 }, 2)).toBe(true);
    // Pressed to close: false immediately, though the ghost is still fading.
    expect(isExpanded({ kind: 'closing', index: 2 }, 2)).toBe(false);
    expect(isExpanded(CLOSED, 2)).toBe(false);
    // Never true for anyone else.
    expect(isExpanded({ kind: 'open', index: 2 }, 1)).toBe(false);
  });

  it('cuts straight to the end state when motion is off', () => {
    const open = toggle(CLOSED, 3, false);
    expect(open).toEqual({ kind: 'open', index: 3 });
    expect(isMoving(open)).toBe(false);
    expect(toggle(open, 3, false)).toEqual(CLOSED);
  });

  it('reverses mid-transition rather than queueing a second one', () => {
    const opening: ExpandPhase = { kind: 'opening', index: 0 };
    expect(toggle(opening, 0, true)).toEqual({ kind: 'closing', index: 0 });
    const closing: ExpandPhase = { kind: 'closing', index: 0 };
    expect(toggle(closing, 0, true)).toEqual({ kind: 'opening', index: 0 });
  });

  it('never leaves two items expanded, whichever one is pressed', () => {
    const open: ExpandPhase = { kind: 'open', index: 0 };
    const swapped = toggle(open, 4, true);
    expect(swapped).toEqual({ kind: 'opening', index: 4 });
    expect(roleOf(swapped, 0)).toBe('leaving');
    expect(activeIndex(swapped)).toBe(4);
  });

  it('settles anything already settled to itself', () => {
    expect(settle(CLOSED)).toBe(CLOSED);
    const open: ExpandPhase = { kind: 'open', index: 2 };
    expect(settle(open)).toBe(open);
  });

  it('runs for §06’s default duration — the one for anything that moves', () => {
    expect(EXPAND_MS).toBe(200);
  });
});
