import { describe, it, expect } from 'vitest';
import { ROVING_KEYS, rovingTarget, toggleChoice } from './roving';

/**
 * V2.0 VB-60. These are the assertions that make "whatever replaces PillGroup
 * keeps ALL of that" checkable rather than believable: both groups call this
 * module, so anything proved here is proved about both of them at once.
 */
describe('the roving tabindex', () => {
  it('moves forward on Right and Down, back on Left and Up', () => {
    expect(rovingTarget('ArrowRight', 0, 4)).toBe(1);
    expect(rovingTarget('ArrowDown', 0, 4)).toBe(1);
    expect(rovingTarget('ArrowLeft', 2, 4)).toBe(1);
    expect(rovingTarget('ArrowUp', 2, 4)).toBe(1);
  });

  it('wraps at both ends, so End is one key away from the start', () => {
    expect(rovingTarget('ArrowRight', 3, 4)).toBe(0);
    expect(rovingTarget('ArrowLeft', 0, 4)).toBe(3);
  });

  it('jumps to the ends on Home and End', () => {
    expect(rovingTarget('Home', 2, 4)).toBe(0);
    expect(rovingTarget('End', 2, 4)).toBe(3);
  });

  it('leaves Space and Enter alone — activation is the button’s own', () => {
    // If this ever returned a number, a group would be intercepting the press
    // that selects, and every option would need its own activation handler.
    expect(rovingTarget(' ', 1, 4)).toBeNull();
    expect(rovingTarget('Enter', 1, 4)).toBeNull();
    expect(rovingTarget('Tab', 1, 4)).toBeNull();
    expect(rovingTarget('a', 1, 4)).toBeNull();
  });

  it('claims exactly six keys, and no seventh arrives unnoticed', () => {
    expect([...ROVING_KEYS].sort()).toEqual([
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'End',
      'Home',
    ]);
    for (const key of ROVING_KEYS) expect(rovingTarget(key, 0, 3)).not.toBeNull();
  });

  it('survives a group with nothing in it', () => {
    for (const key of ROVING_KEYS) expect(rovingTarget(key, 0, 0)).toBeNull();
  });

  it('lands inside the group from any starting index, for every key', () => {
    // A sweep rather than three examples: an off-by-one that only shows up at
    // one end of one axis is exactly the kind of thing a keyboard user finds
    // and a spot check does not.
    for (const count of [1, 2, 5, 9]) {
      for (let index = 0; index < count; index++) {
        for (const key of ROVING_KEYS) {
          const target = rovingTarget(key, index, count)!;
          expect(Number.isInteger(target)).toBe(true);
          expect(target).toBeGreaterThanOrEqual(0);
          expect(target).toBeLessThan(count);
        }
      }
    }
  });
});

describe('what a press does to the selection', () => {
  it('adds and removes in multi, and keeps the order things were picked in', () => {
    expect(toggleChoice([], 'a', 'multi')).toEqual(['a']);
    expect(toggleChoice(['a'], 'b', 'multi')).toEqual(['a', 'b']);
    expect(toggleChoice(['a', 'b'], 'a', 'multi')).toEqual(['b']);
    // The roles loop walks the picks in this order (seedFrom, core/flow/
    // runner.ts), so re-sorting here would silently reorder the interview.
    expect(toggleChoice(['b', 'a'], 'c', 'multi')).toEqual(['b', 'a', 'c']);
  });

  it('replaces in single, and a second press does not empty it', () => {
    expect(toggleChoice([], 'a', 'single')).toEqual(['a']);
    expect(toggleChoice(['a'], 'b', 'single')).toEqual(['b']);
    expect(toggleChoice(['a'], 'a', 'single')).toEqual(['a']);
  });

  it('never mutates what it was given', () => {
    const before = Object.freeze(['a', 'b']);
    expect(() => toggleChoice(before, 'c', 'multi')).not.toThrow();
    expect(before).toEqual(['a', 'b']);
  });
});
