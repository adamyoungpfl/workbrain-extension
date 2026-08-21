import { describe, it, expect } from 'vitest';
import {
  SHIMMER_KEYFRAME,
  SHIMMER_STAGGER_MS,
  SHIMMER_SWEEP_MS,
  attractMs,
  isAttractOver,
  shimmerState,
} from './shimmer';

describe('the follow-up shimmer', () => {
  it('uses §06 durations and no others', () => {
    expect(SHIMMER_SWEEP_MS).toBe(320); // --slow
    expect(SHIMMER_STAGGER_MS).toBe(120); // --fast
  });

  it('costs well under a second for a real row of chips', () => {
    // The shipped data has one to three follow-ups per question. A one-time
    // attract that outlasts the glance it is for is not a one-time attract.
    expect(attractMs(1)).toBe(320);
    expect(attractMs(2)).toBe(440);
    expect(attractMs(3)).toBe(560);
    expect(attractMs(0)).toBe(0);
    expect(attractMs(-1)).toBe(0);
  });

  it('burns the one-time attract out, and leaves the steady modes alone', () => {
    expect(shimmerState('once', false)).toBe('once');
    expect(shimmerState('once', true)).toBe('none');
    expect(shimmerState('hover', true)).toBe('hover');
    expect(shimmerState('continuous', true)).toBe('continuous');
    expect(shimmerState('none', false)).toBe('none');
  });

  it('burns out on the last chip, so a stagger is never cut short', () => {
    expect(isAttractOver('once', SHIMMER_KEYFRAME, 2, 3)).toBe(true);
    expect(isAttractOver('once', SHIMMER_KEYFRAME, 0, 3)).toBe(false);
    expect(isAttractOver('once', SHIMMER_KEYFRAME, 1, 3)).toBe(false);
    expect(isAttractOver('once', SHIMMER_KEYFRAME, 0, 1)).toBe(true);
  });

  it('ignores every other animation that ends on the same row', () => {
    // The chips fade in and out on their own keyframes; those must not be
    // mistaken for the attract finishing.
    expect(isAttractOver('once', 'wb-dd-out', 2, 3)).toBe(false);
    expect(isAttractOver('once', 'wb-dd-in', 2, 3)).toBe(false);
    expect(isAttractOver('once', 'wb-dd-answer-in', 2, 3)).toBe(false);
  });

  it('never burns out a mode that is meant to keep running', () => {
    expect(isAttractOver('continuous', SHIMMER_KEYFRAME, 2, 3)).toBe(false);
    expect(isAttractOver('hover', SHIMMER_KEYFRAME, 2, 3)).toBe(false);
    expect(isAttractOver('none', SHIMMER_KEYFRAME, 2, 3)).toBe(false);
  });
});
