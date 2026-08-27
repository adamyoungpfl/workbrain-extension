import { describe, it, expect } from 'vitest';
import type { ReportState } from '../../schema/storage.types';
import { makeScoreEntry, appendScore } from './scoring';

describe('makeScoreEntry', () => {
  it('carries what the person ticked, out of what they were offered', () => {
    expect(makeScoreEntry(3, 4, '2026-08-20T10:00:00.000Z')).toEqual({
      at: '2026-08-20T10:00:00.000Z',
      value: 3,
      of: 4,
    });
  });

  it('carries the tally and nothing else — no baseline, no comparison', () => {
    // BS-03d: `value` was a 0-10 the person typed and is now the count of
    // statements they ticked. The old rule holds in spirit — one number
    // about the with-file answer, never a pair — and `of` joins it because
    // the checklist's length depends on how much they had answered.
    const entry = makeScoreEntry(2, 2, '2026-08-20T10:00:00.000Z');
    expect(Object.keys(entry).sort()).toEqual(['at', 'of', 'value']);
    expect(entry.value).toBe(2);
    expect(entry.of).toBe(2);
  });

  it('keeps two-of-two and two-of-four apart', () => {
    const small = makeScoreEntry(2, 2, '2026-08-20T10:00:00.000Z');
    const big = makeScoreEntry(2, 4, '2026-08-20T10:00:00.000Z');
    expect(small.value).toBe(big.value);
    expect(small.of).not.toBe(big.of);
  });
});

describe('appendScore', () => {
  it('starts a fresh history when no report exists yet', () => {
    const entry = makeScoreEntry(7, 4, '2026-08-20T10:00:00.000Z');
    expect(appendScore(undefined, entry)).toEqual({ scores: [entry] });
  });

  it('appends to existing scores without dropping or reordering them', () => {
    const first = makeScoreEntry(5, 4, '2026-01-01T00:00:00.000Z');
    const report: ReportState = { scores: [first] };
    const second = makeScoreEntry(8, 4, '2026-08-20T10:00:00.000Z');
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
    const entry = makeScoreEntry(9, 4, '2026-08-20T10:00:00.000Z');
    const next = appendScore(report, entry);
    expect(next.baseline).toBe(report.baseline);
    expect(next.scores).toEqual([entry]);
  });

  it('never mutates the report it was given', () => {
    const report: ReportState = { scores: [] };
    appendScore(report, makeScoreEntry(4, 4, '2026-08-20T10:00:00.000Z'));
    expect(report.scores).toEqual([]);
  });
});

/* BS-03d deleted `scoreDelta` and its three tests with it. The person ticks
   statements about the with-file answer alone, so there is no pair to
   subtract — and Adam's P1 deleted the round trip that produced the two
   numbers, because the AI is no longer asked to grade itself. */
