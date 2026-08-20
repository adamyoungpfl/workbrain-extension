import { describe, it, expect } from 'vitest';
import { daysSince, isDue, roughElapsed, DUE_AFTER_DAYS } from './clocks';

const NOW = new Date('2026-08-20T12:00:00.000Z');

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
}

describe('daysSince', () => {
  it('is zero for the same instant', () => {
    expect(daysSince(NOW.toISOString(), NOW)).toBe(0);
  });

  it('counts whole days elapsed', () => {
    expect(daysSince(daysAgo(1), NOW)).toBe(1);
    expect(daysSince(daysAgo(40), NOW)).toBe(40);
  });

  it('clamps a future answeredAt (clock skew) to zero rather than going negative', () => {
    const future = new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(daysSince(future, NOW)).toBe(0);
  });
});

describe('isDue', () => {
  it('is not due the day before the threshold', () => {
    expect(isDue(daysAgo(DUE_AFTER_DAYS - 1), NOW)).toBe(false);
  });

  it('is due exactly at the threshold — the boundary is inclusive', () => {
    expect(isDue(daysAgo(DUE_AFTER_DAYS), NOW)).toBe(true);
  });

  it('is due the day after the threshold', () => {
    expect(isDue(daysAgo(DUE_AFTER_DAYS + 1), NOW)).toBe(true);
  });

  it('a brand-new answer (0 days) is never due', () => {
    expect(isDue(daysAgo(0), NOW)).toBe(false);
  });

  it('respects a custom threshold, for boundary testing without waiting on the real one', () => {
    expect(isDue(daysAgo(9), NOW, 10)).toBe(false);
    expect(isDue(daysAgo(10), NOW, 10)).toBe(true);
  });
});

describe('roughElapsed', () => {
  it('stays in days under 30', () => {
    expect(roughElapsed(0)).toEqual({ value: 0, unit: 'day' });
    expect(roughElapsed(29)).toEqual({ value: 29, unit: 'day' });
  });

  it('rolls over to months at exactly 30 days', () => {
    expect(roughElapsed(30)).toEqual({ value: 1, unit: 'month' });
  });

  it('stays in months up to 364 days', () => {
    expect(roughElapsed(364)).toEqual({ value: 12, unit: 'month' });
  });

  it('rolls over to years at exactly 365 days', () => {
    expect(roughElapsed(365)).toEqual({ value: 1, unit: 'year' });
  });

  it('rounds to the nearest month/year rather than always flooring', () => {
    expect(roughElapsed(44)).toEqual({ value: 1, unit: 'month' }); // 44/30 = 1.47 -> 1
    expect(roughElapsed(46)).toEqual({ value: 2, unit: 'month' }); // 46/30 = 1.53 -> 2
    expect(roughElapsed(730)).toEqual({ value: 2, unit: 'year' });
  });
});
