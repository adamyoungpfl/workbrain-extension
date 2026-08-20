import { describe, it, expect } from 'vitest';
import type { ReportState } from '../../schema/storage.types';
import { makeScoreEntry, appendScore, scoreDelta } from './scoring';

describe('makeScoreEntry', () => {
  it('carries the with-context score as `value`, stamped with the given time', () => {
    expect(makeScoreEntry(8, '2026-08-20T10:00:00.000Z')).toEqual({
      at: '2026-08-20T10:00:00.000Z',
      value: 8,
    });
  });

  it('never carries the baseline score or a computed delta — only ever the one number given', () => {
    const entry = makeScoreEntry(6, '2026-08-20T10:00:00.000Z');
    expect(Object.keys(entry).sort()).toEqual(['at', 'value']);
    expect(entry.value).toBe(6);
  });
});

describe('appendScore', () => {
  it('starts a fresh history when no report exists yet', () => {
    const entry = makeScoreEntry(7, '2026-08-20T10:00:00.000Z');
    expect(appendScore(undefined, entry)).toEqual({ scores: [entry] });
  });

  it('appends to existing scores without dropping or reordering them', () => {
    const first = makeScoreEntry(5, '2026-01-01T00:00:00.000Z');
    const report: ReportState = { scores: [first] };
    const second = makeScoreEntry(8, '2026-08-20T10:00:00.000Z');
    expect(appendScore(report, second)).toEqual({ scores: [first, second] });
  });

  it('preserves other ReportState fields (baseline, ongoing) untouched', () => {
    const report: ReportState = {
      scores: [],
      baseline: {
        computedAt: '2026-01-01T00:00:00.000Z',
        conversations: 10,
        spanDays: 30,
        setupTaxChars: 100,
        correctionsPerConversation: 1.2,
        repeatedPhrases: [],
      },
    };
    const entry = makeScoreEntry(9, '2026-08-20T10:00:00.000Z');
    const next = appendScore(report, entry);
    expect(next.baseline).toBe(report.baseline);
    expect(next.scores).toEqual([entry]);
  });

  it('never mutates the report it was given', () => {
    const report: ReportState = { scores: [] };
    appendScore(report, makeScoreEntry(4, '2026-08-20T10:00:00.000Z'));
    expect(report.scores).toEqual([]);
  });
});

describe('scoreDelta', () => {
  it('is positive when the with-context answer scored higher', () => {
    expect(scoreDelta(4, 9)).toBe(5);
  });

  it('is negative when the with-context answer scored lower', () => {
    expect(scoreDelta(8, 3)).toBe(-5);
  });

  it('is zero when both scored the same', () => {
    expect(scoreDelta(6, 6)).toBe(0);
  });
});
