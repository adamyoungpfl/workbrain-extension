import { describe, it, expect } from 'vitest';
import {
  TYPE_SPEED_MS,
  charsRevealedAt,
  cueStartedAt,
  typewriterDurationMs,
} from './typewriter';

describe('VB-10 — typewriter arithmetic', () => {
  it('runs at the speed the spec chose', () => {
    // The spec's band is ~8-12ms/char. A change here is a product decision,
    // not a refactor, so it fails as one.
    expect(TYPE_SPEED_MS).toBeGreaterThanOrEqual(8);
    expect(TYPE_SPEED_MS).toBeLessThanOrEqual(12);
  });

  it('reveals one character per speed step', () => {
    expect(charsRevealedAt(0, 10, 10)).toBe(0);
    expect(charsRevealedAt(9, 10, 10)).toBe(0);
    expect(charsRevealedAt(10, 10, 10)).toBe(1);
    expect(charsRevealedAt(55, 10, 10)).toBe(5);
  });

  it('never runs past the end of the string, however late the tick', () => {
    expect(charsRevealedAt(100, 10, 10)).toBe(10);
    // The case that matters: a window Chrome has throttled to one timer a
    // second wakes up with the whole print already due. It catches up in one
    // tick instead of stretching a 100ms print across a minute.
    expect(charsRevealedAt(60_000, 10, 10)).toBe(10);
  });

  it('never runs backwards, whatever the clock does', () => {
    expect(charsRevealedAt(-500, 10, 10)).toBe(0);
    expect(charsRevealedAt(Number.NaN, 10, 10)).toBe(0);
  });

  it('has nothing to print for an empty string', () => {
    expect(charsRevealedAt(1000, 0, 10)).toBe(0);
    expect(typewriterDurationMs(0)).toBe(0);
  });

  it('treats "no rate" as the whole string at once', () => {
    expect(charsRevealedAt(0, 10, 0)).toBe(10);
    expect(charsRevealedAt(0, 10, -1)).toBe(10);
    expect(typewriterDurationMs(10, 0)).toBe(0);
  });

  it('reports the duration a print of a given length takes', () => {
    expect(typewriterDurationMs(75, 10)).toBe(750);
    expect(typewriterDurationMs(75)).toBe(75 * TYPE_SPEED_MS);
    // Duration and reveal agree with each other at the boundary.
    expect(charsRevealedAt(typewriterDurationMs(75, 10), 75, 10)).toBe(75);
    expect(charsRevealedAt(typewriterDurationMs(75, 10) - 1, 75, 10)).toBe(74);
  });
});

describe('VB-10 — the change-triggered cue', () => {
  it('starts a print when there is nothing remembered', () => {
    expect(cueStartedAt(null, 'Orientation', 500)).toEqual({ cue: 'Orientation', startedAt: 500 });
  });

  it('keeps the same start while the cue is unchanged — this is the whole feature', () => {
    // Two questions inside one module. The second must not restart the label.
    const first = cueStartedAt(null, 'Orientation', 500);
    const second = cueStartedAt(first, 'Orientation', 9000);
    expect(second.startedAt).toBe(500);
    expect(second).toBe(first);
  });

  it('starts a new print when the cue changes', () => {
    const first = cueStartedAt(null, 'Orientation', 500);
    const next = cueStartedAt(first, 'About Me', 9000);
    expect(next).toEqual({ cue: 'About Me', startedAt: 9000 });
  });

  it('records rather than consumes, so asking twice answers the same', () => {
    // <StrictMode> renders twice in development. A "has it changed?" flag
    // would say yes then no; this says the same thing both times.
    const once = cueStartedAt(null, 'About Me', 500);
    const twice = cueStartedAt(once, 'About Me', 501);
    expect(twice).toBe(once);
  });

  it('comes back to a cue it has seen before as a fresh print', () => {
    // Going Back into an earlier module is a change, not a resumption: the
    // label is arriving on screen again and says so.
    const a = cueStartedAt(null, 'Orientation', 100);
    const b = cueStartedAt(a, 'About Me', 200);
    const again = cueStartedAt(b, 'Orientation', 300);
    expect(again.startedAt).toBe(300);
  });
});
